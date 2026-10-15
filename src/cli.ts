#!/usr/bin/env node
// Entry point for the `open-a11y` command.

import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { scanSite, type SiteScanResult } from "./scan.js";
import { renderHtmlReport, summarize } from "./report.js";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

const DEFAULT_MAX_PAGES = 25;

const HELP = `open-a11y ${pkg.version}

Helps you find and fix website accessibility issues against WCAG 2.2 AA.
Automated checks catch only part of WCAG; people still need to verify the rest.

Usage:
  open-a11y scan <url-or-file>   Scan a site, following its links, and write a report
  open-a11y --help               Show this help
  open-a11y --version            Show the version

Options:
  -n, --max-pages <number>   Most pages to check (default: ${DEFAULT_MAX_PAGES}; use 1 for one page)
  -o, --out <folder>         Where to write the report (default: open-a11y-report)

Exit codes: 0 no problems found, 1 problems found, 2 could not scan.
`;

/** Accepts a full address, a bare domain like example.com, or a local HTML file. */
export function toScanUrl(input: string): string {
  if (/^(https?|file):/i.test(input)) return new URL(input).href;
  if (existsSync(input)) return pathToFileURL(path.resolve(input)).href;
  return new URL(`https://${input}`).href;
}

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

function parseMaxPages(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    fail(`--max-pages must be a whole number of 1 or more, not "${value}".`);
  }
  return n;
}

async function runScan(target: string, outDir: string, maxPages: number): Promise<void> {
  let url: string;
  try {
    url = toScanUrl(target);
  } catch {
    fail(`"${target}" is not a web address or a file on this computer.`);
  }

  console.log(`Scanning ${url} (up to ${maxPages} page${maxPages === 1 ? "" : "s"}) ...`);
  let result: SiteScanResult;
  try {
    let count = 0;
    result = await scanSite(url, {
      maxPages,
      onProgress: (event) => {
        if ("error" in event) {
          console.log(`  could not open ${event.url}: ${event.error}`);
        } else {
          count++;
          const n = event.result.axe.violations.length;
          console.log(`  [${count}/${maxPages}] ${event.url}: ${n} kind(s) of problem`);
        }
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/Executable doesn't exist/i.test(message)) {
      fail(
        "The hidden browser is not installed yet. Run this once, then try again:\n" +
          "  npx playwright install chromium --only-shell",
      );
    }
    fail(`Could not scan ${url}:\n  ${message.split("\n")[0]}`);
  }

  if (result.pages.length === 0) {
    fail(`Could not open any pages starting from ${url}.`);
  }

  await mkdir(outDir, { recursive: true });
  const htmlPath = path.resolve(outDir, "report.html");
  const jsonPath = path.resolve(outDir, "results.json");
  await writeFile(htmlPath, renderHtmlReport(result), "utf8");
  await writeFile(jsonPath, JSON.stringify(result, null, 2), "utf8");

  const s = summarize(result);
  const impacts = Object.entries(s.byImpact)
    .filter(([, n]) => n > 0)
    .map(([impact, n]) => `${n} ${impact}`)
    .join(", ");
  console.log(
    `\nChecked ${s.pagesScanned} page(s). Found ${s.problems} kind(s) of problem` +
      (impacts ? ` (${impacts})` : "") +
      ` on ${s.pagesWithProblems} page(s), affecting ${s.elements} element(s).` +
      `\n${s.needsReview} check(s) need a person to decide.` +
      (s.pagesFailed ? `\n${s.pagesFailed} page(s) could not be opened.` : "") +
      (result.hitLimit
        ? `\nStopped at the ${maxPages}-page limit; use --max-pages to check more.`
        : "") +
      `\n\nReport: ${htmlPath}\nData:   ${jsonPath}`,
  );
  process.exitCode = s.problems > 0 ? 1 : 0;
}

async function main(): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
        out: { type: "string", short: "o", default: "open-a11y-report" },
        "max-pages": { type: "string", short: "n", default: String(DEFAULT_MAX_PAGES) },
      },
    });
  } catch (err) {
    fail(`${err instanceof Error ? err.message : err}\n\n${HELP}`);
  }
  const { values, positionals } = parsed;
  const [command, target] = positionals;

  if (values.version) {
    console.log(pkg.version);
  } else if (command === "scan" && !values.help) {
    if (!target) fail(`Please give a web address to scan.\n\n${HELP}`);
    await runScan(target, values.out, parseMaxPages(values["max-pages"]));
  } else {
    console.log(HELP);
  }
}

await main();
