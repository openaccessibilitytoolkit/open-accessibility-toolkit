import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  groupByRule,
  renderHtmlReport,
  summarize,
  wcagCriteria,
} from "../src/report.js";
import { renderMarkdownSummary } from "../src/summary.js";
import { fakeNode, fakePage, fakeRule, fakeScan } from "./helpers.js";

describe("escapeHtml", () => {
  it("escapes characters that could break or inject HTML", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });
});

describe("wcagCriteria", () => {
  it("turns axe tags into WCAG success criterion numbers", () => {
    expect(wcagCriteria(["wcag2a", "wcag111", "wcag1410", "wcag2411", "best-practice"])).toEqual([
      "1.1.1",
      "1.4.10",
      "2.4.11",
    ]);
  });
});

describe("groupByRule", () => {
  it("groups the same rule across pages and keeps the most severe impact", () => {
    const pages = [
      fakePage("https://example.com/", [fakeRule("image-alt", "serious", [fakeNode("<img>")])]),
      fakePage("https://example.com/about", [
        fakeRule("image-alt", "critical", [fakeNode("<img>"), fakeNode("<img>")]),
        fakeRule("color-contrast", "serious", [fakeNode("<p>", "p")]),
      ]),
    ];
    const groups = groupByRule(pages, (p) => p.axe.violations);
    expect(groups.map((g) => g.rule.id)).toEqual(["image-alt", "color-contrast"]);
    expect(groups[0].impact).toBe("critical");
    expect(groups[0].elements).toBe(3);
    expect(groups[0].pages).toHaveLength(2);
  });
});

describe("summarize", () => {
  it("counts pages, kinds of problem, elements and severities", () => {
    const scan = fakeScan(
      [
        fakePage("https://example.com/", [fakeRule("image-alt", "critical", [fakeNode("<img>")])]),
        fakePage("https://example.com/ok", []),
      ],
      { errors: [{ url: "https://example.com/gone", reason: "The server answered 404" }] },
    );
    expect(summarize(scan)).toEqual({
      pagesScanned: 2,
      pagesWithProblems: 1,
      pagesFailed: 1,
      problems: 1,
      elements: 1,
      byImpact: { critical: 1, serious: 0, moderate: 0, minor: 0 },
      needsReview: 0,
    });
  });
});

describe("renderHtmlReport", () => {
  it("uses the plain-English explanation when there is one", () => {
    const html = renderHtmlReport(
      fakeScan([fakePage("https://example.com/", [fakeRule("image-alt", "critical", [fakeNode("<img>")])])]),
    );
    expect(html).toContain("Images need a text description");
    expect(html).toContain("Who it affects:");
    expect(html).toContain("Technical details from the checker");
  });

  it("falls back to axe-core's wording for rules without an explanation", () => {
    const html = renderHtmlReport(
      fakeScan([fakePage("https://example.com/", [fakeRule("blink", "serious", [fakeNode("<blink>")])])]),
    );
    expect(html).toContain("Help for blink");
  });

  it("never lets page content inject HTML into the report", () => {
    const evil = `<img src=x onerror="alert(1)"><script>alert(2)</script>`;
    const html = renderHtmlReport(
      fakeScan([
        fakePage("https://example.com/", [fakeRule("image-alt", "critical", [fakeNode(evil)])], [], evil),
      ]),
    );
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain(`onerror="alert`);
    expect(html).toContain("&lt;script&gt;alert(2)&lt;/script&gt;");
  });

  it("never claims the site is compliant", () => {
    const html = renderHtmlReport(fakeScan([fakePage("https://example.com/", [])]));
    expect(html).toContain("not automatically accessible or compliant");
    expect(html).not.toMatch(/\bis compliant\b/i);
    expect(html).toContain("No problems were found by the automated checks");
  });

  it("says when the page limit stopped the scan", () => {
    const html = renderHtmlReport(fakeScan([fakePage("https://example.com/", [])], { hitLimit: true }));
    expect(html).toContain("The scan stopped at its limit");
  });
});

describe("renderMarkdownSummary", () => {
  it("lists problems in a table with plain titles", () => {
    const md = renderMarkdownSummary(
      fakeScan([fakePage("https://example.com/", [fakeRule("image-alt", "critical", [fakeNode("<img>")])])]),
    );
    expect(md).toContain("| critical | Images need a text description | 1.1.1 | 1 | 1 |");
    expect(md).toContain("People still need to check the rest");
  });

  it("escapes characters that would break the table", () => {
    const md = renderMarkdownSummary(
      fakeScan([fakePage("https://example.com/", [fakeRule("blink", "minor", [fakeNode("<blink>")])])]),
    );
    expect(md).toContain("| minor | Help for blink |");
    const evil = renderMarkdownSummary(
      fakeScan([
        fakePage("https://example.com/", [
          { ...fakeRule("blink", "minor", [fakeNode("<b>")]), help: "a | b [x](y)" },
        ]),
      ]),
    );
    expect(evil).toContain("a \\| b \\[x\\](y)");
  });
});
