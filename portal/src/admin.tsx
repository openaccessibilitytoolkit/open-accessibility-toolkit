// The owner's pages: login, inbox, a report with its timeline, and delete.

import type { Child } from "hono/jsx";
import { reference, type ReportRow, type Site } from "./db.js";
import { Layout } from "./layout.js";
import { STATUSES, describeEvent, formatTime, type TimelineEvent } from "./timeline.js";
import { ASSISTIVE_TECH, type AssistiveTech } from "./validate.js";

function AdminHeader(props: { email: string }) {
  return (
    <header class="site-header">
      <nav aria-label="Portal">
        <a href="/admin">Reports</a>
        <a href="/admin/sites">Websites</a>
        <a href="/admin/reports.csv">Download spreadsheet</a>
        <span class="who">Logged in as {props.email}</span>
        <form method="post" action="/admin/logout">
          <button type="submit" class="link-button">
            Log out
          </button>
        </form>
      </nav>
    </header>
  );
}

export function AdminLayout(props: { title: string; email: string; children: Child }) {
  return (
    <Layout title={`${props.title} - Accessibility portal`} header={<AdminHeader email={props.email} />} wide>
      {props.children}
    </Layout>
  );
}

// ---- Login ----

export function LoginPage(props: { sent?: boolean; error?: string; email?: string }) {
  return (
    <Layout title={`${props.error ? "Error: " : ""}Log in - Accessibility portal`}>
      <h1>Log in to your accessibility portal</h1>
      {props.sent ? (
        <div class="saved" tabindex={-1} autofocus>
          <p>
            If that address can log in, we've sent it a login link. The link works once and expires in 15 minutes.
            Check your spam folder if it doesn't arrive.
          </p>
        </div>
      ) : (
        <p>We'll email you a link to log in. No password needed.</p>
      )}
      <form method="post" action="/admin/login" novalidate>
        <div class="field">
          <label for="email">Your email</label>
          {props.error && (
            <p id="email-error" class="error-message">
              Error: {props.error}
            </p>
          )}
          <input
            type="email"
            id="email"
            name="email"
            autocomplete="email"
            value={props.email ?? ""}
            aria-invalid={props.error ? "true" : undefined}
            aria-describedby={props.error ? "email-error" : undefined}
            autofocus={!!props.error}
          />
        </div>
        <button type="submit">Email me a login link</button>
      </form>
    </Layout>
  );
}

/** The page the login link opens. The extra click stops email virus-scanners from using up the link. */
export function VerifyPage(props: { token: string }) {
  return (
    <Layout title="Log in - Accessibility portal">
      <h1>Log in</h1>
      <p>Press the button to finish logging in on this device. You'll stay logged in for 7 days.</p>
      <form method="post" action="/admin/login/verify">
        <input type="hidden" name="token" value={props.token} />
        <button type="submit">Log me in</button>
      </form>
    </Layout>
  );
}

// ---- Inbox ----

function excerpt(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}


export function InboxPage(props: {
  email: string;
  reports: ReportRow[];
  counts: Record<string, number>;
  sites: Site[];
  filter: { siteId?: string; status?: string };
  page: number;
  hasMore: boolean;
  timeZone: string;
  deleted?: string;
}) {
  const { reports, counts, sites, filter, page } = props;
  const query = (p: number) => {
    const params = new URLSearchParams();
    if (filter.siteId) params.set("site", filter.siteId);
    if (filter.status) params.set("status", filter.status);
    if (p > 1) params.set("page", String(p));
    const q = params.toString();
    return q ? `/admin?${q}` : "/admin";
  };
  return (
    <AdminLayout title="Reports" email={props.email}>
      {props.deleted && (
        <div class="saved" tabindex={-1} autofocus>
          <p>Report {props.deleted} was deleted.</p>
        </div>
      )}
      <h1>Accessibility reports</h1>
      <ul class="counts" aria-label="Reports by status">
        {Object.entries(STATUSES).map(([key, label]) => (
          <li>
            {label}: <strong>{counts[key] ?? 0}</strong>
          </li>
        ))}
      </ul>

      <form method="get" action="/admin" class="filters">
        <div>
          <label for="site">Website</label>
          <br />
          <select id="site" name="site">
            <option value="">All websites</option>
            {sites.map((s) => (
              <option value={s.id} selected={filter.siteId === s.id}>
                {s.organization} ({new URL(s.website).host})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label for="status">Status</label>
          <br />
          <select id="status" name="status">
            <option value="">All statuses</option>
            {Object.entries(STATUSES).map(([key, label]) => (
              <option value={key} selected={filter.status === key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit">Show reports</button>
      </form>

      {sites.length === 0 ? (
        <p>
          You haven't added a website yet. <a href="/admin/sites/new">Add your first website</a> to get your report form
          and accessibility statement.
        </p>
      ) : reports.length === 0 ? (
        <p>No reports match. When visitors report a problem, it will appear here.</p>
      ) : (
        <table>
          <caption>Reports, newest first</caption>
          <thead>
            <tr>
              <th scope="col">Reference</th>
              <th scope="col">Website</th>
              <th scope="col">Received</th>
              <th scope="col">Status</th>
              <th scope="col">What went wrong</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr>
                <td>
                  <a href={`/admin/reports/${r.id}`}>{reference(r.id)}</a>
                </td>
                <td>{new URL(r.website).host}</td>
                <td>{formatTime(r.received_at, props.timeZone)}</td>
                <td>{STATUSES[r.status as keyof typeof STATUSES] ?? r.status}</td>
                <td>{excerpt(r.description)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {(page > 1 || props.hasMore) && (
        <nav aria-label="More reports">
          <p>
            {page > 1 && <a href={query(page - 1)}>Newer reports</a>}
            {page > 1 && props.hasMore && " · "}
            {props.hasMore && <a href={query(page + 1)}>Older reports</a>}
          </p>
        </nav>
      )}
    </AdminLayout>
  );
}

// ---- One report ----

export function ReportPage(props: {
  email: string;
  report: ReportRow;
  events: TimelineEvent[];
  timeZone: string;
  saved?: boolean;
  error?: string;
}) {
  const { report } = props;
  const ref = reference(report.id);
  let howUsed: string[] = [];
  try {
    howUsed = (JSON.parse(report.assistive_tech) as AssistiveTech[]).map((t) => ASSISTIVE_TECH[t] ?? t);
  } catch {
    // Leave it empty if the stored list is unreadable.
  }
  return (
    <AdminLayout title={`${props.error ? "Error: " : ""}Report ${ref}`} email={props.email}>
      {props.saved && (
        <div class="saved" tabindex={-1} autofocus>
          <p>Your changes were saved.</p>
        </div>
      )}
      <p>
        <a href="/admin">Back to all reports</a>
      </p>
      <h1>Report {ref}</h1>
      <dl class="details">
        <dt>Website</dt>
        <dd>
          {report.organization} ({new URL(report.website).host})
        </dd>
        <dt>Received</dt>
        <dd>{formatTime(report.received_at, props.timeZone)}</dd>
        <dt>Status</dt>
        <dd>{STATUSES[report.status as keyof typeof STATUSES] ?? report.status}</dd>
        <dt>Page</dt>
        <dd>{report.page || "Not given"}</dd>
        <dt>How they were using the site</dt>
        <dd>{howUsed.length ? howUsed.join("; ") : "Not given"}</dd>
        <dt>Visitor's email</dt>
        <dd>
          {report.email ? (
            <a href={`mailto:${report.email}?subject=${encodeURIComponent(`Your accessibility report ${ref}`)}`}>
              {report.email}
            </a>
          ) : (
            "Not given"
          )}
        </dd>
        <dt>What went wrong</dt>
        <dd>{report.description}</dd>
      </dl>

      <h2>Update this report</h2>
      <form method="post" action={`/admin/reports/${report.id}`}>
        <fieldset>
          <legend>Status</legend>
          {Object.entries(STATUSES).map(([key, label]) => (
            <div class="choice">
              <input type="radio" id={`status-${key}`} name="status" value={key} checked={report.status === key} />
              <label for={`status-${key}`}>{label}</label>
            </div>
          ))}
        </fieldset>
        <div class="field">
          <label for="note">Add a note (optional)</label>
          <p id="note-hint" class="hint">
            For example, what you changed to fix it. Notes are only seen by people who can log in here.
          </p>
          {props.error && (
            <p id="note-error" class="error-message">
              Error: {props.error}
            </p>
          )}
          <textarea
            id="note"
            name="note"
            rows={3}
            maxlength={2000}
            aria-describedby={props.error ? "note-hint note-error" : "note-hint"}
            aria-invalid={props.error ? "true" : undefined}
          ></textarea>
        </div>
        <button type="submit">Save</button>
      </form>

      <h2>Timeline</h2>
      <ol class="timeline">
        {props.events.map((e) => (
          <li>
            <time datetime={e.at}>{formatTime(e.at, props.timeZone)}</time>: {describeEvent(e)}
          </li>
        ))}
      </ol>

      <h2>Delete</h2>
      <p>
        <a href={`/admin/reports/${report.id}/delete`}>Delete this report</a>
      </p>
    </AdminLayout>
  );
}

export function DeletePage(props: { email: string; report: ReportRow }) {
  const ref = reference(props.report.id);
  return (
    <AdminLayout title={`Delete report ${ref}?`} email={props.email}>
      <h1>Delete report {ref}?</h1>
      <p>
        This permanently deletes the report and its whole timeline. <strong>It can't be undone.</strong> If you need a
        record, download the spreadsheet first.
      </p>
      <form method="post" action={`/admin/reports/${props.report.id}/delete`}>
        <button type="submit" class="danger">
          Yes, delete it permanently
        </button>
      </form>
      <p>
        <a href={`/admin/reports/${props.report.id}`}>No, go back to the report</a>
      </p>
    </AdminLayout>
  );
}
