// Checks one open page with axe-core and keeps only what we store. Kept apart from
// Cloudflare's browser library, so the same code can be tried with any Playwright
// browser.

import { contrastDetail, isContrastData } from "./explanations.js";
import { WCAG_TAGS, type CheckOutcome, type FoundProblem, type Impact } from "./scans.js";

const PAGE_TIMEOUT_MS = 20_000;
const EXAMPLES_PER_PROBLEM = 3;

/** The parts of a Playwright page this uses. */
export interface PageLike {
  goto(url: string, options: { waitUntil: "load"; timeout: number }): Promise<{ status(): number; headers(): Record<string, string> } | null>;
  evaluate(expression: string): Promise<unknown>;
  url(): string;
  title(): Promise<string>;
}

/**
 * Runs axe-core inside the page and returns only what we keep: a few examples per
 * problem, never the whole page. Written as plain JavaScript text, because it runs in the
 * browser, not in the portal.
 */
const IN_PAGE = `async ({ tags, examples }) => {
  const result = await axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] });
  const problems = result.violations.map((v) => ({
    id: v.id,
    impact: v.impact || null,
    help: v.help,
    helpUrl: v.helpUrl,
    tags: v.tags,
    count: v.nodes.length,
    examples: v.nodes.slice(0, examples).map((n) => {
      const check = (n.any || []).find((c) => c.data && typeof c.data === "object" && "fgColor" in c.data);
      return { target: (n.target || []).join(" "), html: String(n.html || "").slice(0, 300), data: check ? check.data : null };
    }),
  }));
  const links = Array.from(document.querySelectorAll("a[href]"), (a) => a.href).slice(0, 500);
  return { problems, needsReview: result.incomplete.map((r) => r.id), links };
}`;

interface InPageResult {
  problems: (Omit<FoundProblem, "examples"> & { examples: { target: string; html: string; data: unknown }[] })[];
  needsReview: string[];
  links: string[];
}

const IMPACTS: Impact[] = ["critical", "serious", "moderate", "minor"];

export function firstLine(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).split("\n")[0];
}

/**
 * Opens the address in the page and checks it. `rethrow` picks out errors that should
 * stop the whole check (like the browser's daily allowance running out); any other
 * problem opening the page is recorded against that page.
 */
export async function checkPage(page: PageLike, url: string, axeSource: string, rethrow: (e: unknown) => boolean = () => false): Promise<CheckOutcome> {
  let response;
  try {
    response = await page.goto(url, { waitUntil: "load", timeout: PAGE_TIMEOUT_MS });
  } catch (e) {
    if (rethrow(e)) throw e;
    return { kind: "error", url, reason: /timeout/i.test(firstLine(e)) ? "The page took too long to open." : firstLine(e) };
  }
  if (response && response.status() >= 400) {
    return { kind: "error", url, reason: `The website answered with error ${response.status()}.` };
  }
  const type = response?.headers()["content-type"];
  if (type && !type.includes("html")) return { kind: "skip", url };
  await page.evaluate(axeSource);
  const found = (await page.evaluate(`(${IN_PAGE})(${JSON.stringify({ tags: WCAG_TAGS, examples: EXAMPLES_PER_PROBLEM })})`)) as InPageResult;
  return {
    kind: "page",
    url: page.url(),
    title: (await page.title()) || page.url(),
    links: found.links,
    findings: {
      needsReview: found.needsReview,
      problems: found.problems.map((p) => ({
        id: p.id,
        impact: IMPACTS.includes(p.impact as Impact) ? p.impact : null,
        help: p.help,
        helpUrl: p.helpUrl,
        tags: p.tags,
        count: p.count,
        examples: p.examples.map((ex) => ({
          target: ex.target,
          html: ex.html,
          ...(isContrastData(ex.data) ? { detail: contrastDetail(ex.data) } : {}),
        })),
      })),
    },
  };
}
