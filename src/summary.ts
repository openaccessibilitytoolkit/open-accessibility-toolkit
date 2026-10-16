// A short Markdown summary of a scan, for the GitHub Actions run page
// (and anywhere else Markdown is shown). The full detail stays in report.html.

import { explain } from "./explanations.js";
import { groupByRule, summarize, wcagCriteria } from "./report.js";
import type { SiteScanResult } from "./scan.js";

/** Stops page text such as titles from breaking the Markdown table or adding links. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]<>|]/g, (c) => `\\${c}`).replace(/\s+/g, " ").trim();
}

export function renderMarkdownSummary(result: SiteScanResult): string {
  const s = summarize(result);
  const problems = groupByRule(result.pages, (p) => p.axe.violations);
  const lines = [
    "## Accessibility scan",
    "",
    `Checked ${s.pagesScanned} page(s) starting from \`${result.startUrl.replace(/`/g, "")}\` ` +
      "against WCAG 2.2 Level A and AA automated rules.",
    "",
  ];

  if (problems.length === 0) {
    lines.push("**No problems were found by the automated checks.**");
  } else {
    lines.push(
      `**Found ${s.problems} kind(s) of problem on ${s.pagesWithProblems} page(s), ` +
        `affecting ${s.elements} element(s).**`,
      "",
      "| Severity | Problem | WCAG | Elements | Pages |",
      "| --- | --- | --- | --- | --- |",
      ...problems.map((g) => {
        const title = explain(g.rule.id)?.title ?? g.rule.help;
        const criteria = wcagCriteria(g.rule.tags).join(", ");
        return `| ${g.impact ?? "minor"} | ${escapeMarkdown(title)} | ${criteria} | ${g.elements} | ${g.pages.length} |`;
      }),
    );
  }

  lines.push("");
  if (s.needsReview > 0) lines.push(`${s.needsReview} check(s) need a person to decide.`);
  if (s.pagesFailed > 0) lines.push(`${s.pagesFailed} page(s) could not be opened.`);
  if (result.hitLimit) {
    lines.push(`The scan stopped at its limit of ${result.maxPages} page(s); some pages were not checked.`);
  }
  lines.push(
    "",
    "The full report with explanations and fixes is in the `report.html` file attached to this run.",
    "",
    "_Automated checks find only some kinds of problems. People still need to check the rest, " +
      "such as using the site with only a keyboard or a screen reader._",
    "",
  );
  return lines.join("\n");
}
