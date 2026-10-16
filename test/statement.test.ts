import { describe, expect, it } from "vitest";
import type { SiteSettings } from "../src/settings.js";
import {
  formatDate,
  renderFooterHtml,
  renderInstructions,
  renderStatementHtml,
  renderStatementMarkdown,
  scanFacts,
  scanMatchesSite,
  type ScanFacts,
} from "../src/statement.js";
import { fakeNode, fakePage, fakeRule, fakeScan } from "./helpers.js";

const site: SiteSettings = {
  id: "joesbakery-com",
  organization: "Joe's Bakery",
  website: "https://www.joesbakery.com/",
  contactEmail: "hello@joesbakery.com",
  replyDays: 5,
  statementUrl: "https://www.joesbakery.com/accessibility-statement",
};

const facts: ScanFacts = {
  date: "2026-10-16T12:00:00.000Z",
  pagesChecked: 12,
  problems: [
    { title: "Images need a text description", pages: 3 },
    { title: "Text is too faint to read easily", pages: 1 },
  ],
};

const preparedOn = "2026-10-16T15:00:00.000Z";

describe("renderStatementHtml", () => {
  const html = renderStatementHtml(site, facts, preparedOn);

  it("covers every part of a W3C-style statement", () => {
    for (const heading of [
      "Our commitment",
      "The standard we aim for",
      "How accessible this website is",
      "Problems we know about",
      "How we checked",
      "Tell us about a problem",
      "Date of this statement",
    ]) {
      expect(html).toContain(`<h2>${heading}</h2>`);
    }
  });

  it("says the site partially conforms", () => {
    expect(html).toContain("partially conforms with WCAG 2.2 Level AA");
  });

  it("lists known problems with page counts and the scan date", () => {
    expect(html).toContain("<li>Images need a text description (3 pages)</li>");
    expect(html).toContain("<li>Text is too faint to read easily (1 page)</li>");
    expect(html).toContain("October 16, 2026");
    expect(html).toContain("covered 12 pages");
  });

  it("gives the contact email, reply time and date", () => {
    expect(html).toContain(">hello@joesbakery.com</a>");
    expect(html).toContain("within 5 working days");
    expect(html).toContain("prepared on October 16, 2026");
  });

  it("adds the phone number and portal form only when given", () => {
    expect(html).not.toContain("Phone:");
    expect(html).not.toContain("Online form:");
    const full = renderStatementHtml(
      { ...site, phone: "+1 (555) 010-0100", reportProblemUrl: "https://help.joesbakery.com/report" },
      facts,
      preparedOn,
    );
    expect(full).toContain(`Phone: <a href="tel:+15550100100">+1 (555) 010-0100</a>`);
    expect(full).toContain(`Online form: <a href="https://help.joesbakery.com/report">`);
  });

  it("escapes the organization name", () => {
    const evil = renderStatementHtml({ ...site, organization: "<script>x</script>" }, facts, preparedOn);
    expect(evil).not.toContain("<script>x");
    expect(evil).toContain("&lt;script&gt;x&lt;/script&gt;");
  });

  it("is honest when there is no scan, or the scan found nothing", () => {
    expect(renderStatementHtml(site, undefined, preparedOn)).toContain("We have not listed any known problems yet");
    const clean = renderStatementHtml(site, { ...facts, problems: [] }, preparedOn);
    expect(clean).toContain("did not find any problems");
    expect(clean).toContain("there may still be problems we don&#39;t know about");
  });
});

describe("never promises compliance", () => {
  const variants = [
    renderStatementHtml(site, facts, preparedOn),
    renderStatementHtml(site, undefined, preparedOn),
    renderStatementHtml(site, { ...facts, problems: [] }, preparedOn),
    renderStatementMarkdown(site, facts, preparedOn),
    renderFooterHtml(site),
    renderInstructions(site),
  ];
  it.each(variants.map((text, i) => [i, text]))("output %i", (_, text) => {
    expect(text).not.toMatch(/complian|lawsuit|fully conform|guarantee/i);
  });
});

describe("renderStatementMarkdown", () => {
  it("says the same things as the HTML version", () => {
    const md = renderStatementMarkdown(site, facts, preparedOn);
    expect(md).toContain("# Accessibility statement for Joe's Bakery");
    expect(md).toContain("## Problems we know about");
    expect(md).toContain("- Images need a text description (3 pages)");
    expect(md).toContain("- Email: [hello@joesbakery.com](mailto:hello@joesbakery.com?subject=");
  });
});

describe("renderFooterHtml", () => {
  it("is two plain links with no script", () => {
    const footer = renderFooterHtml(site);
    expect(footer).toContain(`<a href="https://www.joesbakery.com/accessibility-statement">Accessibility statement</a>`);
    expect(footer).toContain(
      `<a href="mailto:hello@joesbakery.com?subject=Accessibility%20problem%20on%20our%20website">Report an accessibility problem</a>`,
    );
    expect(footer).not.toMatch(/<script|onclick|style=/i);
  });

  it("points to the portal form once there is one", () => {
    const footer = renderFooterHtml({ ...site, reportProblemUrl: "https://help.joesbakery.com/report" });
    expect(footer).toContain(`<a href="https://help.joesbakery.com/report">Report an accessibility problem</a>`);
  });
});

describe("scan facts", () => {
  const scan = fakeScan([
    fakePage("https://joesbakery.com/", [fakeRule("image-alt", "critical", [fakeNode("<img>")])]),
    fakePage("https://joesbakery.com/menu", [fakeRule("image-alt", "critical", [fakeNode("<img>")])]),
  ]);

  it("turns a scan into plain-English known problems", () => {
    expect(scanFacts(scan)).toEqual({
      date: scan.scannedAt,
      pagesChecked: 2,
      problems: [{ title: "Images need a text description", pages: 2 }],
    });
  });

  it("only uses a scan of the same website, ignoring www", () => {
    expect(scanMatchesSite(scan, site)).toBe(true);
    expect(scanMatchesSite(fakeScan([fakePage("https://example.org/", [])]), site)).toBe(false);
  });

  it("formats dates the same way on every computer", () => {
    expect(formatDate("2026-01-05T23:30:00.000Z")).toBe("January 5, 2026");
  });
});
