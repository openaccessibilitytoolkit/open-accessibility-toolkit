// The public pages: the report form, the thank-you page, and friendly errors.

import type { Site } from "./db.js";
import { Layout } from "./layout.js";
import { HONEYPOT_FIELD } from "./safeguards.js";
import { ASSISTIVE_TECH, LIMITS, type FieldError, type ReportInput } from "./validate.js";

function host(site: Site): string {
  return new URL(site.website).host;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

const EMPTY: ReportInput = { description: "", page: "", email: "", assistiveTech: [] };

export function ReportForm(props: { site: Site; values?: ReportInput; errors?: FieldError[]; now: number }) {
  const { site, now } = props;
  const values = props.values ?? EMPTY;
  const errors = props.errors ?? [];
  const errorFor = (field: FieldError["field"]) => errors.find((e) => e.field === field);
  const describedBy = (field: FieldError["field"], hint: boolean) =>
    [hint ? `${field}-hint` : "", errorFor(field) ? `${field}-error` : ""].filter(Boolean).join(" ") || undefined;
  const title = `Report an accessibility problem - ${site.organization}`;

  return (
    <Layout title={errors.length ? `Error: ${title}` : title}>
      {errors.length > 0 && (
        <div class="error-summary" tabindex={-1} autofocus aria-labelledby="error-summary-title">
          <h2 id="error-summary-title">Please fix {plural(errors.length, "thing")}</h2>
          <ul>
            {errors.map((e) => (
              <li>
                <a href={`#${e.field}`}>{e.message}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h1>Report an accessibility problem</h1>
      <p>
        Tell {site.organization} about anything on {host(site)} that is hard or impossible to use. We read every
        report.
      </p>

      <form method="post" action={`/report/${site.id}`} novalidate>
        <div class="field">
          <label for="description">What went wrong? (required)</label>
          <p id="description-hint" class="hint">
            For example: "I couldn't press the Order button using my keyboard."
          </p>
          {errorFor("description") && (
            <p id="description-error" class="error-message">
              Error: {errorFor("description")!.message}
            </p>
          )}
          <textarea
            id="description"
            name="description"
            rows={6}
            maxlength={LIMITS.description}
            required
            aria-required="true"
            aria-invalid={errorFor("description") ? "true" : undefined}
            aria-describedby={describedBy("description", true)}
          >
            {values.description}
          </textarea>
        </div>

        <div class="field">
          <label for="page">Which page? (optional)</label>
          <p id="page-hint" class="hint">
            The page address, or a description like "the contact page".
          </p>
          {errorFor("page") && (
            <p id="page-error" class="error-message">
              Error: {errorFor("page")!.message}
            </p>
          )}
          <input
            type="text"
            id="page"
            name="page"
            value={values.page}
            maxlength={LIMITS.page}
            aria-invalid={errorFor("page") ? "true" : undefined}
            aria-describedby={describedBy("page", true)}
          />
        </div>

        <fieldset aria-describedby="assistive-hint">
          <legend>How were you using the site? (optional)</legend>
          <p id="assistive-hint" class="hint">
            This helps us find the problem. You don't have to answer. Tick any that apply.
          </p>
          {Object.entries(ASSISTIVE_TECH).map(([value, label]) => (
            <div class="choice">
              <input
                type="checkbox"
                id={`assistive-${value}`}
                name="assistive"
                value={value}
                checked={values.assistiveTech.includes(value as keyof typeof ASSISTIVE_TECH)}
              />
              <label for={`assistive-${value}`}>{label}</label>
            </div>
          ))}
        </fieldset>

        <div class="field">
          <label for="email">Your email (optional)</label>
          <p id="email-hint" class="hint">
            Only if you'd like a reply. We'll also send you a confirmation with your reference number.
          </p>
          {errorFor("email") && (
            <p id="email-error" class="error-message">
              Error: {errorFor("email")!.message}
            </p>
          )}
          <input
            type="email"
            id="email"
            name="email"
            value={values.email}
            autocomplete="email"
            maxlength={LIMITS.email}
            aria-invalid={errorFor("email") ? "true" : undefined}
            aria-describedby={describedBy("email", true)}
          />
        </div>

        <div class="trap" aria-hidden="true">
          <label for="trap-field">Leave this empty</label>
          <input type="text" id="trap-field" name={HONEYPOT_FIELD} tabindex={-1} autocomplete="off" />
        </div>
        <input type="hidden" name="started" value={String(now)} />

        <p class="notice">
          We only use what you send to fix the problem and reply to you. We aim to reply within{" "}
          {plural(site.reply_days, "working day")}.
        </p>
        <button type="submit">Send report</button>
      </form>
    </Layout>
  );
}

export function ThankYou(props: { site: Site; reference?: string }) {
  const { site, reference } = props;
  return (
    <Layout title={`Thank you - ${site.organization}`}>
      <h1>Thank you, we've received your report</h1>
      {reference && (
        <p>
          Your reference number is <span class="reference">{reference}</span>
        </p>
      )}
      <p>
        {site.organization} aims to reply within {plural(site.reply_days, "working day")}. If you gave your email
        address, we've sent you a confirmation.
      </p>
      <p>
        <a href={site.website}>Back to {host(site)}</a>
      </p>
    </Layout>
  );
}

export function Message(props: { title: string; children: string; link?: { href: string; text: string } }) {
  return (
    <Layout title={props.title}>
      <h1>{props.title}</h1>
      <p>{props.children}</p>
      {props.link && (
        <p>
          <a href={props.link.href}>{props.link.text}</a>
        </p>
      )}
    </Layout>
  );
}
