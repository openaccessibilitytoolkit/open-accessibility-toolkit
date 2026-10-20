// The public accessibility statement for each website, and its footer links.
// Same honest wording as the command-line statement generator: it always says
// "partially conforms" and never claims the website is compliant.

import type { Site } from "./db.js";
import { Layout, SiteHeader } from "./layout.js";

function host(site: Site): string {
  return new URL(site.website).host;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function longDate(iso: string | null, timeZone: string): string {
  const date = iso ? new Date(iso) : new Date();
  try {
    return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone });
  } catch {
    return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  }
}

export function knownProblemList(site: Site): string[] {
  return site.known_problems
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export const statementPath = (site: Site) => `/statement/${site.id}`;
export const reportPath = (site: Site) => `/report/${site.id}`;

export function StatementPage(props: { site: Site; timeZone: string }) {
  const { site } = props;
  const problems = knownProblemList(site);
  const mailto = `mailto:${site.contact_email}?subject=${encodeURIComponent("Accessibility problem on your website")}`;
  return (
    <Layout
      title={`Accessibility statement for ${site.organization}`}
      header={<SiteHeader name={site.organization} subtitle="Accessibility" />}
    >
      <article class="card prose">
        <h1>Accessibility statement for {site.organization}</h1>

        <h2>Our commitment</h2>
        <p>
          {site.organization} wants everyone to be able to use {host(site)}, including people with disabilities. This
          statement explains how accessible the website is, the problems we know about, and how to contact us if you
          have trouble.
        </p>

        <h2>The standard we aim for</h2>
        <p>
          We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at Level AA. These are the international
          guidelines for making websites accessible.
        </p>

        <h2>How accessible this website is</h2>
        <p>
          {host(site)} partially conforms with WCAG 2.2 Level AA. This means some parts of the website do not yet fully
          meet the standard.
        </p>

        <h2>Problems we know about</h2>
        {problems.length > 0 ? (
          <>
            <p>We know about these problems and are working to fix them:</p>
            <ul>
              {problems.map((p) => (
                <li>{p}</li>
              ))}
            </ul>
            <p>There may be others we don't know about yet. If you find one, please tell us.</p>
          </>
        ) : (
          <p>
            We have not listed any known problems yet. There may be parts of the website that are hard to use. If you
            find one, please tell us.
          </p>
        )}

        <h2>How we check</h2>
        <p>
          We check the website for accessibility problems ourselves, and we fix problems that visitors report to us.
          Automated checks cannot find every problem, so feedback from visitors is very important to us.
        </p>

        <h2>Tell us about a problem</h2>
        <p>
          If you have trouble using any part of our website, or need information in a different format, please contact
          us:
        </p>
        <ul>
          <li>
            <a href={reportPath(site)}>Report an accessibility problem online</a>
          </li>
          <li>
            Email: <a href={mailto}>{site.contact_email}</a>
          </li>
          {site.phone && (
            <li>
              Phone: <a href={`tel:${site.phone.replace(/[^0-9+]/g, "")}`}>{site.phone}</a>
            </li>
          )}
        </ul>
        <p>We aim to reply within {plural(site.reply_days, "working day")}.</p>

        <h2>Date of this statement</h2>
        <p>This statement was last reviewed on {longDate(site.reviewed_at ?? site.updated_at, props.timeZone)}.</p>
      </article>
    </Layout>
  );
}

/** The two footer links. Plain links only: no script, no widget. */
export function footerHtml(site: Site, origin: string): string {
  return `<!-- Accessibility links from Open Accessibility Toolkit. Paste into your website's footer. -->
<p class="accessibility-links">
  <a href="${origin}${statementPath(site)}">Accessibility statement</a>
  &middot;
  <a href="${origin}${reportPath(site)}">Report an accessibility problem</a>
</p>`;
}
