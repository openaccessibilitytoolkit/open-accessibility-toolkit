// The owner's pages: login, inbox, a report with its timeline, and delete.

import { useContext, type Child } from "hono/jsx";
import { ViewerContext, canManagePeople, canManageWebsites } from "./access.js";
import { reference, type ReportRow, type Site } from "./db.js";
import { Layout, SiteHeader } from "./layout.js";
import { STATUSES, describeEvent, formatTime, type TimelineEvent } from "./timeline.js";
import { UpdateContext, updateAvailable } from "./updates.js";
import { ASSISTIVE_TECH, type AssistiveTech } from "./validate.js";

export type AdminSection = "reports" | "sites" | "setup" | "people";

const SECTIONS: [AdminSection, string, string][] = [
  ["reports", "/admin", "Reports"],
  ["sites", "/admin/sites", "Websites"],
  ["setup", "/admin/setup", "Check my setup"],
  ["people", "/admin/people", "People"],
];

function AdminHeader(props: { email: string; section?: AdminSection; sectionHome?: boolean }) {
  // Only show what this person can use.
  const viewer = useContext(ViewerContext);
  const sections = SECTIONS.filter(([key]) =>
    key === "people" ? viewer !== null && canManagePeople(viewer) : key === "setup" ? viewer !== null && canManageWebsites(viewer) : true,
  );
  return (
    <SiteHeader name="Accessibility portal" href="/admin">
      <div class="account">
        <span class="who">Logged in as {props.email}</span>
        <form method="post" action="/admin/logout">
          <button type="submit" class="link-button">
            Log out
          </button>
        </form>
      </div>
      <nav aria-label="Portal">
        <ul>
          {sections.map(([key, href, text]) => (
            <li>
              <a href={href} aria-current={props.section === key ? (props.sectionHome ? "page" : "true") : undefined}>
                {text}
              </a>
            </li>
          ))}
          <li>
            <a href="/admin/reports.csv">Download spreadsheet</a>
          </li>
        </ul>
      </nav>
    </SiteHeader>
  );
}

/** Tells portal owners, on every page, that a new version is waiting. Check my setup has the details. */
function UpdateBanner(props: { section?: AdminSection; sectionHome?: boolean }) {
  const update = useContext(UpdateContext);
  if (!update?.latest || !updateAvailable(update) || (props.section === "setup" && props.sectionHome)) return null;
  return (
    <div class="notice">
      <p>
        <strong>An update is available:</strong> version {update.latest.version} (you have {update.current}).{" "}
        <a href="/admin/setup#updates">See what's new and update</a>
      </p>
    </div>
  );
}

export function AdminLayout(props: {
  title: string;
  email: string;
  children: Child;
  /** Which part of the portal this page belongs to, to show it in the menu. */
  section?: AdminSection;
  /** True on the section's main page, false on pages inside it. */
  sectionHome?: boolean;
}) {
  return (
    <Layout
      title={`${props.title} - Accessibility portal`}
      header={<AdminHeader email={props.email} section={props.section} sectionHome={props.sectionHome} />}
      wide
    >
      <UpdateBanner section={props.section} sectionHome={props.sectionHome} />
      {props.children}
    </Layout>
  );
}

// ---- Login ----

/** The header for the login pages: just the wordmark, as there's nowhere else to go yet. */
function PortalHeader() {
  return <SiteHeader name="Accessibility portal" />;
}

export function LoginPage(props: { sent?: boolean; error?: string; email?: string }) {
  return (
    <Layout title={`${props.error ? "Error: " : ""}Log in - Accessibility portal`} header={<PortalHeader />}>
      <h1>Log in to your accessibility portal</h1>
      {props.sent ? (
        <div class="saved" tabindex={-1} autofocus>
          <p>
            If that address can log in, we've sent it a login link. The link works once and expires in 15 minutes.
            Check your spam folder if it doesn't arrive.
          </p>
        </div>
      ) : (
        <p class="lead">We'll email you a link to log in. No password needed.</p>
      )}
      <form method="post" action="/admin/login" class="card" novalidate>
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
    <Layout title="Log in - Accessibility portal" header={<PortalHeader />}>
      <h1>Log in</h1>
      <form method="post" action="/admin/login/verify" class="card">
        <p>Press the button to finish logging in on this device. You'll stay logged in for 7 days.</p>
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

/** The status as a coloured badge. The words carry the meaning; the colour only helps scanning. */
function StatusBadge(props: { status: string }) {
  return <span class={`badge ${props.status}`}>{STATUSES[props.status as keyof typeof STATUSES] ?? props.status}</span>;
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
    <AdminLayout title="Reports" email={props.email} section="reports" sectionHome>
      {props.deleted && (
        <div class="saved" tabindex={-1} autofocus>
          <p>Report {props.deleted} was deleted.</p>
        </div>
      )}
      <h1>Accessibility reports</h1>
      <ul class="counts" aria-label="Reports by status">
        {Object.entries(STATUSES).map(([key, label]) => (
          <li class={key}>
            {label}: <strong>{counts[key] ?? 0}</strong>
          </li>
        ))}
      </ul>

      <form method="get" action="/admin" class="filters card">
        <div>
          <label for="site">Website</label>
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
        <p class="card">
          You haven't added a website yet. <a href="/admin/sites/new">Add your first website</a> to get your report form
          and accessibility statement.
        </p>
      ) : reports.length === 0 ? (
        <p class="card">No reports match. When visitors report a problem, it will appear here.</p>
      ) : (
        <div class="card table-card" role="region" aria-label="Reports" tabindex={0}>
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
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td>{excerpt(r.description)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(page > 1 || props.hasMore) && (
        <nav aria-label="More reports">
          <p class="pager">
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
    <AdminLayout title={`${props.error ? "Error: " : ""}Report ${ref}`} email={props.email} section="reports">
      {props.saved && (
        <div class="saved" tabindex={-1} autofocus>
          <p>Your changes were saved.</p>
        </div>
      )}
      <p>
        <a href="/admin">Back to all reports</a>
      </p>
      <h1>Report {ref}</h1>
      <div class="report-layout">
        <div class="card details-card">
          <h2>Details</h2>
          <dl class="details">
            <dt>Website</dt>
            <dd>
              {report.organization} ({new URL(report.website).host})
            </dd>
            <dt>Received</dt>
            <dd>{formatTime(report.received_at, props.timeZone)}</dd>
            <dt>Status</dt>
            <dd>
              <StatusBadge status={report.status} />
            </dd>
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
            <dd class="description">{report.description}</dd>
          </dl>
        </div>

        <div class="card update-card">
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
        </div>

        <div class="card timeline-card">
          <h2>Timeline</h2>
          <ol class="timeline">
            {props.events.map((e) => (
              <li>
                <time datetime={e.at}>{formatTime(e.at, props.timeZone)}</time>
                <span class="visually-hidden">: </span>
                {describeEvent(e)}
              </li>
            ))}
          </ol>
        </div>

        <div class="card delete-card">
          <h2>Delete</h2>
          <p>
            <a href={`/admin/reports/${report.id}/delete`}>Delete this report</a>
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}

export function DeletePage(props: { email: string; report: ReportRow }) {
  const ref = reference(props.report.id);
  return (
    <AdminLayout title={`Delete report ${ref}?`} email={props.email} section="reports">
      <div class="card warning narrow">
        <h1>Delete report {ref}?</h1>
        <p>
          This permanently deletes the report and its whole timeline. <strong>It can't be undone.</strong> If you need
          a record, download the spreadsheet first.
        </p>
        <form method="post" action={`/admin/reports/${props.report.id}/delete`}>
          <button type="submit" class="danger">
            Yes, delete it permanently
          </button>
        </form>
        <p>
          <a href={`/admin/reports/${props.report.id}`}>No, go back to the report</a>
        </p>
      </div>
    </AdminLayout>
  );
}
