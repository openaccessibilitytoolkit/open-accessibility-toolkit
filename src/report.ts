// Turns a site scan into a summary and a readable HTML report.
// Problems are grouped by rule across pages, because the same mistake in a
// shared header or template usually shows up on every page.
// The report itself must be accessible, so it uses real headings, landmarks,
// text labels next to colours, and high-contrast colours.

import type { ImpactValue, NodeResult, Result } from "axe-core";
import type { PageResult, SiteScanResult } from "./scan.js";
import { elementDetail, explain, type Explanation } from "./explanations.js";

type Impact = NonNullable<ImpactValue>;

const IMPACT_ORDER: Impact[] = ["critical", "serious", "moderate", "minor"];

/** Keeps the report a sensible size; results.json always has everything. */
const MAX_ELEMENTS_PER_PAGE = 20;

export interface RuleGroup {
  /** The rule as axe reported it on the first page it was found. */
  rule: Result;
  /** The most severe impact seen on any page. */
  impact: Impact | undefined;
  pages: { url: string; title: string; nodes: NodeResult[] }[];
  elements: number;
}

export interface Summary {
  pagesScanned: number;
  pagesWithProblems: number;
  pagesFailed: number;
  /** Number of different rules that failed somewhere on the site. */
  problems: number;
  /** Number of page elements affected across all pages. */
  elements: number;
  /** Failed rules counted by how much they affect people. */
  byImpact: Record<Impact, number>;
  /** Rules axe could not decide on; a person needs to check them. */
  needsReview: number;
}

function impactRank(impact: ImpactValue | undefined): number {
  const i = impact ? IMPACT_ORDER.indexOf(impact) : -1;
  return i === -1 ? IMPACT_ORDER.length : i;
}

export function groupByRule(
  pages: PageResult[],
  pick: (page: PageResult) => Result[],
): RuleGroup[] {
  const groups = new Map<string, RuleGroup>();
  for (const page of pages) {
    for (const rule of pick(page)) {
      let group = groups.get(rule.id);
      if (!group) {
        group = { rule, impact: rule.impact ?? undefined, pages: [], elements: 0 };
        groups.set(rule.id, group);
      }
      if (impactRank(rule.impact) < impactRank(group.impact)) {
        group.impact = rule.impact ?? undefined;
      }
      group.pages.push({ url: page.url, title: page.title, nodes: rule.nodes });
      group.elements += rule.nodes.length;
    }
  }
  return [...groups.values()].sort(
    (a, b) => impactRank(a.impact) - impactRank(b.impact) || b.elements - a.elements,
  );
}

export function summarize(result: SiteScanResult): Summary {
  const problems = groupByRule(result.pages, (p) => p.axe.violations);
  const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const g of problems) if (g.impact) byImpact[g.impact]++;
  return {
    pagesScanned: result.pages.length,
    pagesWithProblems: result.pages.filter((p) => p.axe.violations.length > 0).length,
    pagesFailed: result.errors.length,
    problems: problems.length,
    elements: problems.reduce((n, g) => n + g.elements, 0),
    byImpact,
    needsReview: groupByRule(result.pages, (p) => p.axe.incomplete).length,
  };
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Turns axe tags like "wcag1410" into WCAG success criteria like "1.4.10". */
export function wcagCriteria(tags: string[]): string[] {
  return tags.flatMap((tag) => {
    const m = /^wcag(\d)(\d)(\d+)$/.exec(tag);
    return m ? [`${m[1]}.${m[2]}.${m[3]}`] : [];
  });
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function pageName(page: { url: string; title: string }): string {
  return page.title.trim() || page.url;
}

function selectorFor(node: NodeResult): string {
  return node.target
    .map((t) => (Array.isArray(t) ? t.join(" >>> ") : String(t)))
    .join(" | ");
}

function renderNode(ruleId: string, node: NodeResult): string {
  const detail = elementDetail(ruleId, node);
  return `<li>
  <p class="label">Where: <code>${escapeHtml(selectorFor(node))}</code></p>
  <pre tabindex="0"><code>${escapeHtml(node.html)}</code></pre>
  ${detail ? `<p>${escapeHtml(detail)}</p>` : ""}
  ${
    node.failureSummary
      ? `<details class="tech"><summary>Technical details from the checker</summary>
  <p class="why">${escapeHtml(node.failureSummary)}</p></details>`
      : ""
  }
</li>`;
}

function renderRulePage(ruleId: string, page: RuleGroup["pages"][number]): string {
  const shown = page.nodes.slice(0, MAX_ELEMENTS_PER_PAGE);
  const hidden = page.nodes.length - shown.length;
  return `<details>
  <summary>${escapeHtml(pageName(page))} (${plural(page.nodes.length, "element")})</summary>
  <p class="meta">Address: <a href="${escapeHtml(page.url)}">${escapeHtml(page.url)}</a></p>
  <ol>${shown.map((node) => renderNode(ruleId, node)).join("\n")}</ol>
  ${hidden > 0 ? `<p>And ${plural(hidden, "more element")}. See results.json for the full list.</p>` : ""}
</details>`;
}

function renderExplanation(e: Explanation): string {
  return `<p><strong>What's wrong:</strong> ${escapeHtml(e.problem)}</p>
  <p><strong>Who it affects:</strong> ${escapeHtml(e.affects)}</p>
  <p><strong>How to fix it:</strong></p>
  <ol>${e.fix.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
  <div class="example">
    <p class="label">Before:</p>
    <pre tabindex="0"><code>${escapeHtml(e.before)}</code></pre>
    <p class="label">After:</p>
    <pre tabindex="0"><code>${escapeHtml(e.after)}</code></pre>
  </div>`;
}

function renderProblem(group: RuleGroup): string {
  const { rule } = group;
  const impact = group.impact ?? "minor";
  const criteria = wcagCriteria(rule.tags);
  const explanation = explain(rule.id);
  const id = `rule-${escapeHtml(rule.id)}`;
  return `<section class="rule" aria-labelledby="${id}">
  <h3 id="${id}">${escapeHtml(explanation?.title ?? rule.help)}</h3>
  <p><span class="badge ${impact}">${capitalize(impact)}</span>
    ${criteria.length ? `WCAG ${criteria.map(escapeHtml).join(", ")} &middot; ` : ""}rule <code>${escapeHtml(rule.id)}</code></p>
  ${explanation ? renderExplanation(explanation) : `<p>${escapeHtml(rule.description)}</p>`}
  <p><a href="${escapeHtml(rule.helpUrl)}">More about &ldquo;${escapeHtml(rule.help)}&rdquo; (Deque University)</a></p>
  <p><strong>Found on ${plural(group.pages.length, "page")}, ${plural(group.elements, "element")} in total.</strong></p>
  ${group.pages.map((page) => renderRulePage(rule.id, page)).join("\n")}
</section>`;
}

function renderNeedsReview(group: RuleGroup): string {
  const title = explain(group.rule.id)?.title ?? group.rule.help;
  return `<li><a href="${escapeHtml(group.rule.helpUrl)}">${escapeHtml(title)}</a>
  (${plural(group.elements, "element")} on ${plural(group.pages.length, "page")})</li>`;
}

function renderPageRow(page: PageResult): string {
  const elements = page.axe.violations.reduce((n, v) => n + v.nodes.length, 0);
  return `<tr>
  <td><a href="${escapeHtml(page.url)}">${escapeHtml(pageName(page))}</a></td>
  <td>${page.axe.violations.length}</td>
  <td>${elements}</td>
</tr>`;
}

export function renderHtmlReport(result: SiteScanResult): string {
  const s = summarize(result);
  const problems = groupByRule(result.pages, (p) => p.axe.violations);
  const needsReview = groupByRule(result.pages, (p) => p.axe.incomplete);
  const scanned = new Date(result.scannedAt).toUTCString();
  const axeVersion = result.pages[0]?.axe.testEngine.version ?? "unknown";
  const siteName = result.pages[0] ? new URL(result.pages[0].url).host || "local files" : result.startUrl;
  const impactList = IMPACT_ORDER.filter((i) => s.byImpact[i] > 0)
    .map((i) => `<li><span class="badge ${i}">${capitalize(i)}</span> ${s.byImpact[i]}</li>`)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accessibility scan report: ${escapeHtml(siteName)}</title>
<style>
  :root { --text: #1a1a1a; --muted: #4a4a4a; --bg: #ffffff; --panel: #f3f4f6; --link: #0b57d0; --border: #c7c7c7; }
  body { font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--text); background: var(--bg); margin: 0; }
  main { max-width: 60rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
  a { color: var(--link); }
  code { font-family: ui-monospace, Consolas, monospace; font-size: 0.9em; overflow-wrap: anywhere; }
  pre { background: var(--panel); border: 1px solid var(--border); padding: 0.75rem; overflow-x: auto; white-space: pre-wrap; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--border); overflow-wrap: anywhere; }
  caption { text-align: left; font-weight: 600; padding-bottom: 0.25rem; }
  .notice { background: #fff8e1; border-left: 6px solid #8a6d00; padding: 0.75rem 1rem; }
  .meta { color: var(--muted); }
  .rule { border-top: 1px solid var(--border); padding-top: 0.5rem; margin-top: 1.5rem; }
  .badge { display: inline-block; padding: 0 0.5rem; border-radius: 4px; color: #fff; font-weight: 600; font-size: 0.875rem; }
  .critical { background: #9b1c1c; } .serious { background: #9a3412; }
  .moderate { background: #6b4e00; } .minor { background: #374151; }
  .summary ul { list-style: none; padding: 0; display: flex; gap: 1rem; flex-wrap: wrap; }
  .why { white-space: pre-line; color: var(--muted); }
  .label { margin-bottom: 0.25rem; }
  details { margin: 0.5rem 0; }
  details summary { cursor: pointer; font-weight: 600; }
  details.tech summary { font-weight: normal; color: var(--muted); }
  .example { border-left: 4px solid var(--border); padding-left: 0.75rem; }
</style>
</head>
<body>
<main>
<h1>Accessibility scan report</h1>
<p class="meta">Site: <code>${escapeHtml(siteName)}</code><br>
Started from: <code>${escapeHtml(result.startUrl)}</code><br>
Scanned: ${escapeHtml(scanned)}<br>
Checked against: WCAG 2.2 Level A and AA automated rules (axe-core ${escapeHtml(axeVersion)})</p>

<p class="notice"><strong>Please read:</strong> this report helps you find and fix accessibility
issues. Automated checks can only find some kinds of problems. A page with no problems
listed here is not automatically accessible or compliant; people still need to check
the rest, such as using the site with only a keyboard or a screen reader.</p>

<section class="summary" aria-labelledby="summary">
<h2 id="summary">Summary</h2>
<p>${plural(s.pagesScanned, "page")} checked. ${plural(s.problems, "kind")} of problem found
on ${plural(s.pagesWithProblems, "page")}, affecting ${plural(s.elements, "element")} in total.
${plural(s.needsReview, "check")} need a person to decide.</p>
${impactList ? `<ul>${impactList}</ul>` : ""}
${
  result.hitLimit
    ? `<p><strong>The scan stopped at its limit of ${plural(result.maxPages, "page")}.</strong>
Some pages were not checked. Run it again with a higher <code>--max-pages</code> to check more.</p>`
    : ""
}
${s.pagesFailed ? `<p>${plural(s.pagesFailed, "page")} could not be opened; see the list at the end.</p>` : ""}
</section>

<section aria-labelledby="problems">
<h2 id="problems">Problems found</h2>
${
  problems.length
    ? problems.map(renderProblem).join("\n")
    : `<p>No problems were found by the automated checks. That is a good start,
       but the checks below still need a person.</p>`
}
</section>

<section aria-labelledby="review">
<h2 id="review">Needs a person to check</h2>
${
  needsReview.length
    ? `<p>The automated checks could not decide on these. Look at each one yourself.</p>
<ul>${needsReview.map(renderNeedsReview).join("\n")}</ul>`
    : `<p>Nothing was flagged for review, but keyboard, screen reader and caption checks
       always need a person.</p>`
}
</section>

<section aria-labelledby="pages">
<h2 id="pages">Pages checked</h2>
<table>
<caption>Problems found on each page</caption>
<thead><tr><th scope="col">Page</th><th scope="col">Kinds of problem</th><th scope="col">Elements affected</th></tr></thead>
<tbody>
${result.pages.map(renderPageRow).join("\n")}
</tbody>
</table>
</section>
${
  result.errors.length
    ? `<section aria-labelledby="errors">
<h2 id="errors">Pages that could not be opened</h2>
<p>These links may be broken, or the server may have been busy. Broken links are worth fixing too.</p>
<ul>${result.errors
        .map((e) => `<li><code>${escapeHtml(e.url)}</code>: ${escapeHtml(e.reason)}</li>`)
        .join("\n")}</ul>
</section>`
    : ""
}
</main>
</body>
</html>
`;
}
