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

/** Looks at a website's home page for the two footer links. */
export async function checkFooterLinks(site: Site, origin: string): Promise<FooterCheck> {
  try {
    const res = await fetch(site.website, {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "OpenAccessibilityToolkit-Portal/1.0 (setup check)" },
      redirect: "follow",
    });
    if (!res.ok) return { site, state: "unknown", detail: `Your website answered with error ${res.status}.` };
    const html = (await res.text()).slice(0, 2_000_000);
    const hasStatement = html.includes(`${origin}/statement/${site.id}`);
    const hasReport = html.includes(`${origin}/report/${site.id}`);
    if (hasStatement && hasReport) return { site, state: "done", detail: "Both footer links are on your home page." };
    const missing = [!hasStatement && "Accessibility statement", !hasReport && "Report an accessibility problem"]
      .filter(Boolean)
      .join(" and ");
    return { site, state: "attention", detail: `We couldn't find the "${missing}" link on your home page.` };
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
    <AdminLayout title="Check my setup" email={props.email}>
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
