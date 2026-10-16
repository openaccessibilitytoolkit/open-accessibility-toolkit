// The owner's Websites pages: the list, add/edit form with footer links, and delete.

import { AdminLayout } from "./admin.js";
import type { Site } from "./db.js";
import { SITE_LIMITS, type SiteField, type SiteFieldError, type SiteFormValues } from "./site-form.js";
import { footerHtml, reportPath, statementPath } from "./statement.js";

function host(website: string): string {
  try {
    return new URL(website).host;
  } catch {
    return website;
  }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function SitesPage(props: { email: string; sites: Site[]; counts: Record<string, number>; deleted?: string }) {
  return (
    <AdminLayout title="Websites" email={props.email}>
      {props.deleted && (
        <div class="saved" tabindex={-1} autofocus>
          <p>{props.deleted} and its reports were deleted.</p>
        </div>
      )}
      <h1>Your websites</h1>
      <p>
        <a href="/admin/sites/new">Add a website</a>
      </p>
      {props.sites.length === 0 ? (
        <p>You haven't added a website yet.</p>
      ) : (
        <table>
          <caption>Websites this portal looks after</caption>
          <thead>
            <tr>
              <th scope="col">Website</th>
              <th scope="col">Organization</th>
              <th scope="col">Contact email</th>
              <th scope="col">Reports</th>
            </tr>
          </thead>
          <tbody>
            {props.sites.map((s) => (
              <tr>
                <td>
                  <a href={`/admin/sites/${s.id}`}>{host(s.website)}</a>
                </td>
                <td>{s.organization}</td>
                <td>{s.contact_email}</td>
                <td>{props.counts[s.id] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminLayout>
  );
}

function Field(props: {
  id: SiteField;
  label: string;
  hint?: string;
  value: string;
  errors: SiteFieldError[];
  type?: "text" | "email" | "number";
  multiline?: boolean;
  autocomplete?: string;
}) {
  const error = props.errors.find((e) => e.field === props.id);
  const describedBy = [props.hint ? `${props.id}-hint` : "", error ? `${props.id}-error` : ""].filter(Boolean).join(" ");
  const common = {
    id: props.id,
    name: props.id,
    "aria-invalid": error ? "true" : undefined,
    "aria-describedby": describedBy || undefined,
  };
  return (
    <div class="field">
      <label for={props.id}>{props.label}</label>
      {props.hint && (
        <p id={`${props.id}-hint`} class="hint">
          {props.hint}
        </p>
      )}
      {error && (
        <p id={`${props.id}-error`} class="error-message">
          Error: {error.message}
        </p>
      )}
      {props.multiline ? (
        <textarea {...common} rows={4}>
          {props.value}
        </textarea>
      ) : (
        <input
          {...common}
          type={props.type ?? "text"}
          value={props.value}
          autocomplete={props.autocomplete}
          inputmode={props.type === "number" ? "numeric" : undefined}
        />
      )}
    </div>
  );
}

function SiteForm(props: { action: string; values: SiteFormValues; errors: SiteFieldError[]; submit: string }) {
  const { values, errors } = props;
  return (
    <form method="post" action={props.action} novalidate>
      <Field id="organization" label="Organization name" value={values.organization} errors={errors} autocomplete="organization" />
      <Field
        id="website"
        label="Website address"
        hint="For example: joesbakery.com"
        value={values.website}
        errors={errors}
        autocomplete="url"
      />
      <Field
        id="contactEmail"
        label="Email for accessibility problems"
        hint="Shown on your statement. New reports are emailed here."
        value={values.contactEmail}
        errors={errors}
        type="email"
        autocomplete="email"
      />
      <Field
        id="replyDays"
        label="Working days to reply"
        hint="Shown to visitors, for example 5."
        value={values.replyDays}
        errors={errors}
        type="number"
      />
      <Field
        id="phone"
        label="Phone number (optional)"
        hint="Shown on your statement if you add one."
        value={values.phone}
        errors={errors}
        autocomplete="tel"
      />
      <Field
        id="notifyEmails"
        label="Extra people to email about new reports (optional)"
        hint={`One email address on each line, up to ${SITE_LIMITS.notifyEmails}. For example, your web designer.`}
        value={values.notifyEmails}
        errors={errors}
        multiline
      />
      <Field
        id="knownProblems"
        label="Problems you already know about (optional)"
        hint="One problem on each line, in plain words. They're listed on your accessibility statement. For example: Some photos don't have text descriptions yet."
        value={values.knownProblems}
        errors={errors}
        multiline
      />
      <button type="submit">{props.submit}</button>
    </form>
  );
}

function ErrorSummary(props: { errors: SiteFieldError[] }) {
  if (props.errors.length === 0) return null;
  return (
    <div class="error-summary" tabindex={-1} autofocus aria-labelledby="error-summary-title">
      <h2 id="error-summary-title">Please fix {plural(props.errors.length, "thing")}</h2>
      <ul>
        {props.errors.map((e) => (
          <li>
            <a href={`#${e.field}`}>{e.message}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NewSitePage(props: { email: string; values: SiteFormValues; errors: SiteFieldError[] }) {
  return (
    <AdminLayout title={`${props.errors.length ? "Error: " : ""}Add a website`} email={props.email}>
      <ErrorSummary errors={props.errors} />
      <p>
        <a href="/admin/sites">Back to your websites</a>
      </p>
      <h1>Add a website</h1>
      <p>You'll get a report form and an accessibility statement for this website, plus footer links to add to it.</p>
      <SiteForm action="/admin/sites" values={props.values} errors={props.errors} submit="Add website" />
    </AdminLayout>
  );
}

export function SitePage(props: {
  email: string;
  site: Site;
  origin: string;
  values: SiteFormValues;
  errors: SiteFieldError[];
  saved?: boolean;
}) {
  const { site, origin } = props;
  const statementUrl = `${origin}${statementPath(site)}`;
  const reportUrl = `${origin}${reportPath(site)}`;
  return (
    <AdminLayout title={`${props.errors.length ? "Error: " : ""}${host(site.website)}`} email={props.email}>
      <ErrorSummary errors={props.errors} />
      {props.saved && (
        <div class="saved" tabindex={-1} autofocus>
          <p>Your changes were saved. Your accessibility statement is already up to date.</p>
        </div>
      )}
      <p>
        <a href="/admin/sites">Back to your websites</a>
      </p>
      <h1>{host(site.website)}</h1>

      <h2>Your pages</h2>
      <ul>
        <li>
          Accessibility statement: <a href={statementPath(site)}>{statementUrl}</a>
        </li>
        <li>
          Report form: <a href={reportPath(site)}>{reportUrl}</a>
        </li>
      </ul>

      <h2>Add these links to your website's footer</h2>
      <div class="field">
        <label for="footer-code">Footer links (HTML code)</label>
        <p id="footer-code-hint" class="hint">
          Select all of this and copy it.
        </p>
        <textarea id="footer-code" rows={6} readonly aria-describedby="footer-code-hint">
          {footerHtml(site, origin)}
        </textarea>
      </div>
      <details>
        <summary>How to add them in WordPress, Squarespace, Wix or Shopify</summary>
        <ul>
          <li>
            <strong>WordPress:</strong> edit your footer (Appearance, then Editor or Widgets), add a "Custom HTML" block,
            and paste the code.
          </li>
          <li>
            <strong>Squarespace:</strong> edit the footer, add a "Code" block, and paste the code.
          </li>
          <li>
            <strong>Wix:</strong> edit the footer and add two text links: "Accessibility statement" linking to{" "}
            {statementUrl}, and "Report an accessibility problem" linking to {reportUrl}.
          </li>
          <li>
            <strong>Shopify:</strong> go to Content, then Menus, open your footer menu, and add the same two links as
            for Wix.
          </li>
          <li>
            <strong>Your own HTML:</strong> paste the code into your footer.
          </li>
        </ul>
        <p>Menu names change from time to time, so look for something similar if yours differs.</p>
      </details>

      <h2>Settings</h2>
      <SiteForm action={`/admin/sites/${site.id}`} values={props.values} errors={props.errors} submit="Save changes" />

      <h2>Delete this website</h2>
      <p>
        <a href={`/admin/sites/${site.id}/delete`}>Delete {host(site.website)} and its reports</a>
      </p>
    </AdminLayout>
  );
}

export function DeleteSitePage(props: { email: string; site: Site; reportCount: number }) {
  const name = host(props.site.website);
  return (
    <AdminLayout title={`Delete ${name}?`} email={props.email}>
      <h1>Delete {name}?</h1>
      <p>
        This permanently deletes the website, <strong>its {plural(props.reportCount, "report")}</strong> and their
        timelines. Its report form and accessibility statement will stop working.{" "}
        <strong>It can't be undone.</strong>
      </p>
      {props.reportCount > 0 && (
        <p>
          If you need a record, <a href="/admin/reports.csv">download the spreadsheet</a> first.
        </p>
      )}
      <form method="post" action={`/admin/sites/${props.site.id}/delete`}>
        <button type="submit" class="danger">
          Yes, delete it permanently
        </button>
      </form>
      <p>
        <a href={`/admin/sites/${props.site.id}`}>No, go back</a>
      </p>
    </AdminLayout>
  );
}
