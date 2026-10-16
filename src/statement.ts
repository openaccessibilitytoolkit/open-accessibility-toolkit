// Writes an accessibility statement, the footer links, and simple instructions.
// The statement follows the structure W3C recommends: commitment, standard,
// current status, known problems, how the site was checked, how to give feedback,
// and the date. It always says "partially conforms": automated checks can't prove
// that a site fully meets WCAG, so the tool never claims it does.

import { explain } from "./explanations.js";
import { escapeHtml, groupByRule } from "./report.js";
import type { SiteScanResult } from "./scan.js";
import type { SiteSettings } from "./settings.js";
import { escapeMarkdown } from "./summary.js";

export interface KnownProblem {
  title: string;
  pages: number;
}

/** What the statement needs to know about the latest scan, if there is one. */
export interface ScanFacts {
  date: string;
  pagesChecked: number;
  problems: KnownProblem[];
}

export function scanFacts(scan: SiteScanResult): ScanFacts {
  return {
    date: scan.scannedAt,
    pagesChecked: scan.pages.length,
    problems: groupByRule(scan.pages, (p) => p.axe.violations).map((g) => ({
      title: explain(g.rule.id)?.title ?? g.rule.help,
      pages: g.pages.length,
    })),
  };
}

function siteHost(url: string): string {
  return new URL(url).host.toLowerCase().replace(/^www\./, "");
}

/** True when a scan was of this website, so its problems belong in this statement. */
export function scanMatchesSite(scan: SiteScanResult, site: SiteSettings): boolean {
  try {
    return siteHost(scan.startUrl) === siteHost(site.website);
  } catch {
    return false;
  }
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function mailtoLink(email: string): string {
  return `mailto:${email}?subject=${encodeURIComponent("Accessibility problem on our website")}`;
}

/** Where "Report an accessibility problem" goes: the portal form if set up, otherwise email. */
export function reportLink(site: SiteSettings): string {
  return site.reportProblemUrl || mailtoLink(site.contactEmail);
}

/**
 * The statement as a list of sections. Text is plain (no markup) so the HTML and
 * Markdown versions say exactly the same thing. Lists and links are marked separately.
 */
interface Section {
  heading: string;
  paragraphs: string[];
  list?: string[];
  contacts?: { label: string; text: string; href: string }[];
}

function statementSections(site: SiteSettings, facts: ScanFacts | undefined, preparedOn: string): Section[] {
  const host = new URL(site.website).host;
  const sections: Section[] = [
    {
      heading: "Our commitment",
      paragraphs: [
        `${site.organization} wants everyone to be able to use ${host}, including people with disabilities. ` +
          "This statement explains how accessible the website is, the problems we know about, and how to contact us if you have trouble.",
      ],
    },
    {
      heading: "The standard we aim for",
      paragraphs: [
        "We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at Level AA. " +
          "These are the international guidelines for making websites accessible.",
      ],
    },
    {
      heading: "How accessible this website is",
      paragraphs: [
        `${host} partially conforms with WCAG 2.2 Level AA. This means some parts of the website do not yet fully meet the standard.`,
      ],
    },
  ];

  if (facts && facts.problems.length > 0) {
    sections.push({
      heading: "Problems we know about",
      paragraphs: [
        `Our most recent automated check, on ${formatDate(facts.date)}, found these problems. We are working to fix them.`,
        "Automated checks find only some kinds of problems, so there may be others we don't know about yet. If you find one, please tell us.",
      ],
      list: facts.problems.map((p) => `${p.title} (${plural(p.pages, "page")})`),
    });
  } else if (facts) {
    sections.push({
      heading: "Problems we know about",
      paragraphs: [
        `Our most recent automated check, on ${formatDate(facts.date)}, did not find any problems. ` +
          "Automated checks find only some kinds of problems, so there may still be problems we don't know about. If you find one, please tell us.",
      ],
    });
  } else {
    sections.push({
      heading: "Problems we know about",
      paragraphs: [
        "We have not listed any known problems yet. There may be parts of the website that are hard to use. If you find one, please tell us.",
      ],
    });
  }

  sections.push({
    heading: "How we checked",
    paragraphs: [
      facts
        ? `We checked the website ourselves with Open Accessibility Toolkit, a free automated checker. ` +
          `The most recent check was on ${formatDate(facts.date)} and covered ${plural(facts.pagesChecked, "page")}.`
        : "We are checking the website ourselves with Open Accessibility Toolkit, a free automated checker.",
      "Automated checks cannot find every problem, so feedback from visitors is very important to us.",
    ],
  });

  const contacts = [{ label: "Email", text: site.contactEmail, href: mailtoLink(site.contactEmail) }];
  if (site.phone) contacts.push({ label: "Phone", text: site.phone, href: `tel:${site.phone.replace(/[^0-9+]/g, "")}` });
  if (site.reportProblemUrl) {
    contacts.push({ label: "Online form", text: "Report an accessibility problem", href: site.reportProblemUrl });
  }
  sections.push({
    heading: "Tell us about a problem",
    paragraphs: [
      "If you have trouble using any part of our website, or need information in a different format, please contact us:",
      `We aim to reply within ${plural(site.replyDays, "working day")}.`,
    ],
    contacts,
  });

  sections.push({
    heading: "Date of this statement",
    paragraphs: [`This statement was prepared on ${formatDate(preparedOn)}.`],
  });
  return sections;
}

export function renderStatementHtml(
  site: SiteSettings,
  facts: ScanFacts | undefined,
  preparedOn = new Date().toISOString(),
): string {
  const title = `Accessibility statement for ${site.organization}`;
  const body = statementSections(site, facts, preparedOn)
    .map((s) => {
      const [first, ...rest] = s.paragraphs;
      const contacts = s.contacts
        ? `<ul>${s.contacts
            .map((c) => `<li>${escapeHtml(c.label)}: <a href="${escapeHtml(c.href)}">${escapeHtml(c.text)}</a></li>`)
            .join("")}</ul>`
        : "";
      const list = s.list ? `<ul>${s.list.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "";
      return `<h2>${escapeHtml(s.heading)}</h2>
<p>${escapeHtml(first)}</p>
${list}${contacts}
${rest.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n")}`;
    })
    .join("\n\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font: 18px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1a1a1a; background: #ffffff; margin: 0; }
  main { max-width: 42rem; margin: 0 auto; padding: 2rem 1rem 4rem; }
  a { color: #0b57d0; }
  h2 { margin-top: 2rem; }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
${body}
</main>
</body>
</html>
`;
}

export function renderStatementMarkdown(
  site: SiteSettings,
  facts: ScanFacts | undefined,
  preparedOn = new Date().toISOString(),
): string {
  const lines = [`# Accessibility statement for ${escapeMarkdown(site.organization)}`, ""];
  for (const s of statementSections(site, facts, preparedOn)) {
    const [first, ...rest] = s.paragraphs;
    lines.push(`## ${escapeMarkdown(s.heading)}`, "", escapeMarkdown(first), "");
    if (s.list) lines.push(...s.list.map((item) => `- ${escapeMarkdown(item)}`), "");
    if (s.contacts) {
      lines.push(...s.contacts.map((c) => `- ${c.label}: [${escapeMarkdown(c.text)}](${c.href})`), "");
    }
    for (const p of rest) lines.push(escapeMarkdown(p), "");
  }
  return lines.join("\n");
}

/** The two footer links. Plain links only: no script, no widget. */
export function renderFooterHtml(site: SiteSettings): string {
  return `<!-- Accessibility links from Open Accessibility Toolkit. Paste into your website's footer. -->
<p class="accessibility-links">
  <a href="${escapeHtml(site.statementUrl)}">Accessibility statement</a>
  &middot;
  <a href="${escapeHtml(reportLink(site))}">Report an accessibility problem</a>
</p>
`;
}

export function renderInstructions(site: SiteSettings): string {
  return `# Adding your accessibility statement and footer links

## 1. Publish the statement

Create a new page on your website at:

    ${site.statementUrl}

Copy the text from \`statement.md\` (or upload \`statement.html\` as it is) into that page.
Most website builders let you paste the Markdown text straight into a new page; headings
and lists keep their formatting.

## 2. Add the two footer links

The links are in \`footer.html\`. How to add them depends on your website builder.
Menu names change from time to time, so look for something similar if yours differs.

- **WordPress:** edit your footer (Appearance, then Editor or Widgets), add a
  "Custom HTML" block, and paste the contents of \`footer.html\`.
- **Squarespace:** edit the footer, add a "Code" block, and paste the contents of
  \`footer.html\`.
- **Wix:** edit the footer and add two text links: "Accessibility statement" linking to
  your statement page, and "Report an accessibility problem" linking to the second
  address in \`footer.html\`.
- **Shopify:** go to Content, then Menus, open your footer menu, and add the same two
  links as for Wix.
- **Your own HTML:** paste \`footer.html\` into your footer.

## 3. Keep it up to date

Each time you scan your site, run \`open-a11y statement\` again to refresh the list of
known problems and the date, then update the page on your website.
`;
}
