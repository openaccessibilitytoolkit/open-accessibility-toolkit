// Turns a scan result into a summary and a readable HTML report.
// The report itself must be accessible, so it uses real headings, landmarks,
// text labels next to colours, and high-contrast colours.

import type { ImpactValue, NodeResult, Result } from "axe-core";
import type { ScanResult } from "./scan.js";

type Impact = NonNullable<ImpactValue>;

const IMPACT_ORDER: Impact[] = ["critical", "serious", "moderate", "minor"];

export interface Summary {
  /** Number of failed rules. */
  problems: number;
  /** Number of page elements affected across all failed rules. */
  elements: number;
  /** Failed rules counted by how much they affect people. */
  byImpact: Record<Impact, number>;
  /** Rules axe could not decide on; a person needs to check them. */
  needsReview: number;
  passed: number;
}

export function summarize(result: ScanResult): Summary {
  const { violations, incomplete, passes } = result.axe;
  const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const v of violations) if (v.impact) byImpact[v.impact]++;
  return {
    problems: violations.length,
    elements: violations.reduce((n, v) => n + v.nodes.length, 0),
    byImpact,
    needsReview: incomplete.length,
    passed: passes.length,
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

function impactRank(impact: ImpactValue | undefined): number {
  const i = impact ? IMPACT_ORDER.indexOf(impact) : -1;
  return i === -1 ? IMPACT_ORDER.length : i;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function selectorFor(node: NodeResult): string {
  return node.target
    .map((t) => (Array.isArray(t) ? t.join(" >>> ") : String(t)))
    .join(" | ");
}

function renderNode(node: NodeResult): string {
  return `<li>
  <p class="label">Where: <code>${escapeHtml(selectorFor(node))}</code></p>
  <pre tabindex="0"><code>${escapeHtml(node.html)}</code></pre>
  ${node.failureSummary ? `<p class="why">${escapeHtml(node.failureSummary)}</p>` : ""}
</li>`;
}

function renderViolation(v: Result): string {
  const impact = v.impact ?? "minor";
  const criteria = wcagCriteria(v.tags);
  return `<section class="rule" aria-labelledby="rule-${escapeHtml(v.id)}">
  <h3 id="rule-${escapeHtml(v.id)}">${escapeHtml(v.help)}</h3>
  <p><span class="badge ${impact}">${capitalize(impact)}</span>
    ${criteria.length ? `WCAG ${criteria.map(escapeHtml).join(", ")} &middot; ` : ""}rule <code>${escapeHtml(v.id)}</code></p>
  <p>${escapeHtml(v.description)}</p>
  <p><a href="${escapeHtml(v.helpUrl)}">How to fix &ldquo;${escapeHtml(v.help)}&rdquo; (Deque University)</a></p>
  <details>
    <summary>${plural(v.nodes.length, "affected element")}</summary>
    <ol>${v.nodes.map(renderNode).join("\n")}</ol>
  </details>
</section>`;
}

function renderNeedsReview(r: Result): string {
  return `<li><a href="${escapeHtml(r.helpUrl)}">${escapeHtml(r.help)}</a>
  (${plural(r.nodes.length, "element")})</li>`;
}

export function renderHtmlReport(result: ScanResult): string {
  const s = summarize(result);
  const violations = [...result.axe.violations].sort(
    (a, b) => impactRank(a.impact) - impactRank(b.impact),
  );
  const scanned = new Date(result.scannedAt).toUTCString();
  const impactList = IMPACT_ORDER.filter((i) => s.byImpact[i] > 0)
    .map((i) => `<li><span class="badge ${i}">${capitalize(i)}</span> ${s.byImpact[i]}</li>`)
    .join("");

  const problemsSection = violations.length
    ? violations.map(renderViolation).join("\n")
    : `<p>No problems were found by the automated checks. That is a good start,
       but the checks below still need a person.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accessibility scan report: ${escapeHtml(result.title || result.url)}</title>
<style>
  :root { --text: #1a1a1a; --muted: #4a4a4a; --bg: #ffffff; --panel: #f3f4f6; --link: #0b57d0; --border: #c7c7c7; }
  body { font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--text); background: var(--bg); margin: 0; }
  main { max-width: 60rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
  a { color: var(--link); }
  code { font-family: ui-monospace, Consolas, monospace; font-size: 0.9em; overflow-wrap: anywhere; }
  pre { background: var(--panel); border: 1px solid var(--border); padding: 0.75rem; overflow-x: auto; white-space: pre-wrap; }
  .notice { background: #fff8e1; border-left: 6px solid #8a6d00; padding: 0.75rem 1rem; }
  .meta { color: var(--muted); }
  .rule { border-top: 1px solid var(--border); padding-top: 0.5rem; margin-top: 1.5rem; }
  .badge { display: inline-block; padding: 0 0.5rem; border-radius: 4px; color: #fff; font-weight: 600; font-size: 0.875rem; }
  .critical { background: #9b1c1c; } .serious { background: #9a3412; }
  .moderate { background: #6b4e00; } .minor { background: #374151; }
  .summary ul { list-style: none; padding: 0; display: flex; gap: 1rem; flex-wrap: wrap; }
  .why { white-space: pre-line; color: var(--muted); }
  .label { margin-bottom: 0.25rem; }
  details summary { cursor: pointer; font-weight: 600; }
</style>
</head>
<body>
<main>
<h1>Accessibility scan report</h1>
<p class="meta">Page: <a href="${escapeHtml(result.url)}">${escapeHtml(result.title || result.url)}</a><br>
Address: <code>${escapeHtml(result.url)}</code><br>
Scanned: ${escapeHtml(scanned)}<br>
Checked against: WCAG 2.2 Level A and AA automated rules (axe-core ${escapeHtml(result.axe.testEngine.version)})</p>

<p class="notice"><strong>Please read:</strong> this report helps you find and fix accessibility
issues. Automated checks can only find some kinds of problems. A page with no problems
listed here is not automatically accessible or compliant; people still need to check
the rest, such as using the page with only a keyboard or a screen reader.</p>

<section class="summary" aria-labelledby="summary">
<h2 id="summary">Summary</h2>
<p>${plural(s.problems, "problem")} found, affecting ${plural(s.elements, "element")}.
${plural(s.needsReview, "check")} need a person to decide. ${plural(s.passed, "check")} passed.</p>
${impactList ? `<ul>${impactList}</ul>` : ""}
</section>

<section aria-labelledby="problems">
<h2 id="problems">Problems found</h2>
${problemsSection}
</section>

<section aria-labelledby="review">
<h2 id="review">Needs a person to check</h2>
${
  result.axe.incomplete.length
    ? `<p>The automated checks could not decide on these. Look at each one yourself.</p>
<ul>${result.axe.incomplete.map(renderNeedsReview).join("\n")}</ul>`
    : `<p>Nothing was flagged for review, but keyboard, screen reader and caption checks
       always need a person.</p>`
}
</section>
</main>
</body>
</html>
`;
}
