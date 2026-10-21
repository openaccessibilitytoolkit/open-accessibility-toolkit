// "Check my setup": shows the owner, in plain words, what's done and what needs attention.

import { AdminLayout } from "./admin.js";
import type { Site } from "./db.js";
import type { TestEmailResult } from "./email.js";

export const SETUP_GUIDE_URL =
  "https://github.com/openaccessibilitytoolkit/open-accessibility-toolkit/blob/main/docs/setup-guide.md";

export type CheckState = "done" | "attention" | "unknown";

export interface Check {
  state: CheckState;
  title: string;
  detail: string;
  link?: { href: string; text: string };
}

export interface FooterCheck {
  site: Site;
  state: CheckState;
  detail: string;
}

const LABELS: Record<CheckState, string> = {
  done: "Done",
  attention: "Needs attention",
  unknown: "Couldn't check",
};

function fetchText(url: string): Promise<Response> {
  return fetch(url, {
    signal: AbortSignal.timeout(5000),
    headers: { "User-Agent": "OpenAccessibilityToolkit-Portal/1.0 (setup check)" },
    redirect: "follow",
  });
}

/** Reads at most 2 MB, with "https:\/\/" (how links are written inside scripts) turned back into "https://". */
async function readText(res: Response): Promise<string> {
  return (await res.text()).slice(0, 2_000_000).replaceAll("\\/", "/");
}

/**
 * The web addresses of the scripts a page loads, like <script src="...">. Builders load their
 * own tools first and the website's content last, so this keeps the last ones.
 */
function scriptAddresses(html: string, pageUrl: string, max: number): string[] {
  const found: string[] = [];
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const url = new URL(m[1].replaceAll("&amp;", "&"), pageUrl);
      if ((url.protocol === "https:" || url.protocol === "http:") && !found.includes(url.href)) found.push(url.href);
    } catch {
      // Not a web address: skip it.
    }
  }
  return max > 0 ? found.slice(-max) : [];
}

/**
 * Looks at a website's home page for the two footer links. Website builders (like
 * HostGator's, Wix and others) often put the page's content in script files that the
 * page loads, so if the links aren't in the page itself, those scripts are read too.
 */
export async function checkFooterLinks(site: Site, origin: string, maxScripts = 8): Promise<FooterCheck> {
  try {
    const res = await fetchText(site.website);
    if (!res.ok) return { site, state: "unknown", detail: `Your website answered with error ${res.status}.` };
    const html = await readText(res);
    const statementLink = `${origin}/statement/${site.id}`;
    const reportLink = `${origin}/report/${site.id}`;
    let hasStatement = html.includes(statementLink);
    let hasReport = html.includes(reportLink);
    if (!hasStatement || !hasReport) {
      const scripts = await Promise.all(
        scriptAddresses(html, res.url || site.website, maxScripts).map(async (url) => {
          try {
            const script = await fetchText(url);
            return script.ok ? await readText(script) : "";
          } catch {
            return "";
          }
        }),
      );
      hasStatement ||= scripts.some((s) => s.includes(statementLink));
      hasReport ||= scripts.some((s) => s.includes(reportLink));
    }
    if (hasStatement && hasReport) return { site, state: "done", detail: "Both footer links are on your home page." };
    const missing = [!hasStatement && "Accessibility statement", !hasReport && "Report an accessibility problem"]
      .filter(Boolean)
      .join(" and ");
    return { site, state: "attention", detail: `We couldn't find the "${missing}" link on your home page. If you just added the links, check that your website changes are published.` };
  } catch {
    return { site, state: "unknown", detail: "We couldn't open your website from here." };
  }
}

function Status(props: { state: CheckState }) {
  return (
    <strong class={`status ${props.state}`}>
      <span aria-hidden="true">{props.state === "done" ? "✓ " : props.state === "attention" ? "! " : "? "}</span>
      {LABELS[props.state]}:
    </strong>
  );
}

export function SetupPage(props: {
  email: string;
  checks: Check[];
  footers: FooterCheck[];
  emailConnected: boolean;
  testResult?: TestEmailResult;
}) {
  const attention = props.checks.filter((c) => c.state === "attention").length
    + props.footers.filter((f) => f.state === "attention").length;
  return (
    <AdminLayout title="Check my setup" email={props.email} section="setup" sectionHome>
      {props.testResult && (
        <div class={props.testResult.ok ? "saved" : "error-summary"} tabindex={-1} autofocus>
          <p>{props.testResult.message}</p>
          {props.testResult.detail && <p class="hint">Resend said: {props.testResult.detail}</p>}
        </div>
      )}
      <h1>Check my setup</h1>
      <p>
        {attention === 0
          ? "Everything we can check looks good."
          : `${attention} thing${attention === 1 ? " needs" : "s need"} your attention.`}{" "}
        Need help? Follow the <a href={SETUP_GUIDE_URL}>step-by-step setup guide</a>.
      </p>

      <ul class="checks">
        {props.checks.map((c) => (
          <li>
            <Status state={c.state} /> {c.title}
            <p class="hint">
              {c.detail}
              {c.link && (
                <>
                  {" "}
                  <a href={c.link.href}>{c.link.text}</a>
                </>
              )}
            </p>
          </li>
        ))}
      </ul>

      {props.emailConnected && (
        <form method="post" action="/admin/setup/test-email">
          <p>Send a test email to {props.email} to make sure emails really arrive.</p>
          <button type="submit">Send me a test email</button>
        </form>
      )}

      {props.footers.length > 0 && (
        <>
          <h2>Footer links on your websites</h2>
          <ul class="checks">
            {props.footers.map((f) => (
              <li>
                <Status state={f.state} /> {new URL(f.site.website).host}
                <p class="hint">
                  {f.detail} <a href={`/admin/sites/${f.site.id}`}>Get the footer links</a>
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </AdminLayout>
  );
}
