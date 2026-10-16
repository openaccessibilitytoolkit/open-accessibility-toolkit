// The owner's part of the portal, under /admin. Everything except logging in
// needs a valid session.

import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { csrf } from "hono/csrf";
import { DeletePage, InboxPage, LoginPage, ReportPage, VerifyPage } from "./admin.js";
import {
  LOGIN_LINK_MINUTES,
  SESSION_COOKIE,
  SESSION_DAYS,
  consumeLoginToken,
  createLoginToken,
  createSession,
  deleteSession,
  getSessionEmail,
  isAdmin,
} from "./auth.js";
import type { Bindings } from "./bindings.js";
import { toCsv } from "./csv.js";
import {
  countByStatus,
  countSubmission,
  createSite,
  deleteReport,
  deleteSite,
  getSite,
  reportCountsBySite,
  updateSite,
  getReport,
  listEvents,
  listReports,
  listSites,
  reference,
  updateReport,
} from "./db.js";
import { sendLoginEmail } from "./email.js";
import { Message } from "./pages.js";
import { visitorKey } from "./safeguards.js";
import { EMPTY_SITE_FORM, formValuesFromSite, siteIdFor, validateSite } from "./site-form.js";
import { DeleteSitePage, NewSitePage, SitePage, SitesPage } from "./sites.js";
import { STATUSES, formatTime, isStatus } from "./timeline.js";
import { ASSISTIVE_TECH, isEmail, type AssistiveTech } from "./validate.js";

const PAGE_SIZE = 50;
/** Login link requests allowed per visitor per hour, whatever address they type. */
const LOGIN_REQUESTS_PER_HOUR = 10;
const HOUR = 60 * 60 * 1000;

const admin = new Hono<{ Bindings: Bindings; Variables: { admin: string } }>();

// Other websites can't submit forms here on your behalf (checks the Origin header).
admin.use(csrf());
// Private pages are never kept in shared caches.
admin.use(async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});

// ---- Logging in and out ----

admin.get("/login", (c) => c.html(<LoginPage />));

admin.post("/login", async (c) => {
  const form = await c.req.parseBody();
  const email = String(form.email ?? "").trim().toLowerCase();
  if (!isEmail(email)) {
    return c.html(<LoginPage error="Please type your email address, like name@example.com" email={email} />, 400);
  }
  const now = Date.now();
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const requests = await countSubmission(c.env.DB, await visitorKey(ip, "login", c.env.HASH_SALT), now, HOUR);
  // The answer is the same whether or not the address can log in, so nobody can find out who the admins are.
  if (requests <= LOGIN_REQUESTS_PER_HOUR && isAdmin(c.env.ADMIN_EMAILS, email)) {
    const token = await createLoginToken(c.env.DB, email, now);
    if (token) {
      const link = `${new URL(c.req.url).origin}/admin/login/verify?token=${encodeURIComponent(token)}`;
      c.executionCtx.waitUntil(sendLoginEmail(c.env, email, link, LOGIN_LINK_MINUTES).catch((e) => console.error(e)));
    }
  }
  return c.html(<LoginPage sent />);
});

admin.get("/login/verify", (c) => c.html(<VerifyPage token={c.req.query("token") ?? ""} />));

admin.post("/login/verify", async (c) => {
  const form = await c.req.parseBody();
  const email = await consumeLoginToken(c.env.DB, String(form.token ?? ""), Date.now());
  if (!email || !isAdmin(c.env.ADMIN_EMAILS, email)) {
    return c.html(
      <Message title="This login link doesn't work" link={{ href: "/admin/login", text: "Get a new login link" }}>
        Login links work once and expire after 15 minutes. Please ask for a new one.
      </Message>,
      400,
    );
  }
  const session = await createSession(c.env.DB, email, Date.now());
  setCookie(c, SESSION_COOKIE, session, {
    prefix: "host",
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "Lax",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return c.redirect("/admin", 303);
});

admin.post("/logout", async (c) => {
  await deleteSession(c.env.DB, getCookie(c, SESSION_COOKIE, "host"));
  deleteCookie(c, SESSION_COOKIE, { prefix: "host", path: "/", secure: true });
  return c.redirect("/admin/login", 303);
});

// ---- Everything below needs a login ----

admin.use(async (c, next) => {
  const email = await getSessionEmail(c.env.DB, getCookie(c, SESSION_COOKIE, "host"), Date.now(), c.env.ADMIN_EMAILS);
  if (!email) return c.redirect("/admin/login", 303);
  c.set("admin", email);
  await next();
});

admin.get("/", async (c) => {
  const site = c.req.query("site") || undefined;
  const statusParam = c.req.query("status");
  const status = isStatus(statusParam) ? statusParam : undefined;
  const page = Math.max(1, Number.parseInt(c.req.query("page") ?? "1", 10) || 1);
  const filter = { siteId: site, status };
  const [rows, counts, sites] = await Promise.all([
    listReports(c.env.DB, filter, PAGE_SIZE + 1, (page - 1) * PAGE_SIZE),
    countByStatus(c.env.DB, site),
    listSites(c.env.DB),
  ]);
  const deleted = c.req.query("deleted");
  return c.html(
    <InboxPage
      email={c.get("admin")}
      reports={rows.slice(0, PAGE_SIZE)}
      hasMore={rows.length > PAGE_SIZE}
      counts={counts}
      sites={sites}
      filter={filter}
      page={page}
      timeZone={c.env.TIME_ZONE}
      deleted={deleted && /^R-\d{4,}$/.test(deleted) ? deleted : undefined}
    />,
  );
});

admin.get("/reports.csv", async (c) => {
  const rows = await listReports(c.env.DB, {}, 1_000_000, 0);
  const howUsed = (json: string) => {
    try {
      return (JSON.parse(json) as AssistiveTech[]).map((t) => ASSISTIVE_TECH[t] ?? t).join("; ");
    } catch {
      return "";
    }
  };
  const csv = toCsv([
    ["Reference", "Website", "Received", "Status", "Page", "What went wrong", "Visitor's email", "How they were using the site"],
    ...rows.map((r) => [
      reference(r.id),
      new URL(r.website).host,
      formatTime(r.received_at, c.env.TIME_ZONE),
      STATUSES[r.status as keyof typeof STATUSES] ?? r.status,
      r.page,
      r.description,
      r.email,
      howUsed(r.assistive_tech),
    ]),
  ]);
  const day = new Date().toISOString().slice(0, 10);
  return c.body(csv, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="accessibility-reports-${day}.csv"`,
  });
});

async function findReport(c: { env: Bindings; req: { param: (name: "id") => string } }) {
  const id = Number.parseInt(c.req.param("id"), 10);
  return Number.isFinite(id) ? getReport(c.env.DB, id) : null;
}

const notFound = <Message title="Report not found" link={{ href: "/admin", text: "Back to all reports" }}>
  That report doesn't exist. It may have been deleted.
</Message>;

admin.get("/reports/:id", async (c) => {
  const report = await findReport(c);
  if (!report) return c.html(notFound, 404);
  return c.html(
    <ReportPage
      email={c.get("admin")}
      report={report}
      events={await listEvents(c.env.DB, report.id)}
      timeZone={c.env.TIME_ZONE}
      saved={c.req.query("saved") === "1"}
    />,
  );
});

admin.post("/reports/:id", async (c) => {
  const report = await findReport(c);
  if (!report) return c.html(notFound, 404);
  const form = await c.req.parseBody();
  const status = isStatus(form.status) ? form.status : report.status;
  const note = String(form.note ?? "").trim();
  if (note.length > 2000) {
    return c.html(
      <ReportPage
        email={c.get("admin")}
        report={report}
        events={await listEvents(c.env.DB, report.id)}
        timeZone={c.env.TIME_ZONE}
        error="Please keep your note under 2000 characters."
      />,
      400,
    );
  }
  await updateReport(c.env.DB, report, { status, note }, c.get("admin"), new Date());
  return c.redirect(`/admin/reports/${report.id}?saved=1`, 303);
});

admin.get("/reports/:id/delete", async (c) => {
  const report = await findReport(c);
  if (!report) return c.html(notFound, 404);
  return c.html(<DeletePage email={c.get("admin")} report={report} />);
});

admin.post("/reports/:id/delete", async (c) => {
  const report = await findReport(c);
  if (!report) return c.html(notFound, 404);
  await deleteReport(c.env.DB, report.id);
  return c.redirect(`/admin?deleted=${reference(report.id)}`, 303);
});

// ---- Websites ----

const siteNotFound = (
  <Message title="Website not found" link={{ href: "/admin/sites", text: "Back to your websites" }}>
    That website isn't set up in this portal.
  </Message>
);

admin.get("/sites", async (c) => {
  const [sites, counts] = await Promise.all([listSites(c.env.DB), reportCountsBySite(c.env.DB)]);
  const deleted = c.req.query("deleted");
  return c.html(
    <SitesPage
      email={c.get("admin")}
      sites={sites}
      counts={counts}
      deleted={deleted && /^[a-z0-9.-]{1,253}$/i.test(deleted) ? deleted : undefined}
    />,
  );
});

admin.get("/sites/new", (c) => c.html(<NewSitePage email={c.get("admin")} values={EMPTY_SITE_FORM} errors={[]} />));

admin.post("/sites", async (c) => {
  const { values, input, errors } = validateSite(await c.req.parseBody());
  if (!input) return c.html(<NewSitePage email={c.get("admin")} values={values} errors={errors} />, 400);
  const id = siteIdFor(input.website);
  if (await getSite(c.env.DB, id)) {
    const duplicate = [{ field: "website" as const, message: `${new URL(input.website).host} is already set up in this portal.` }];
    return c.html(<NewSitePage email={c.get("admin")} values={values} errors={duplicate} />, 400);
  }
  await createSite(c.env.DB, id, input, new Date());
  return c.redirect(`/admin/sites/${id}?saved=1`, 303);
});

admin.get("/sites/:siteId", async (c) => {
  const site = await getSite(c.env.DB, c.req.param("siteId"));
  if (!site) return c.html(siteNotFound, 404);
  return c.html(
    <SitePage
      email={c.get("admin")}
      site={site}
      origin={new URL(c.req.url).origin}
      values={formValuesFromSite(site)}
      errors={[]}
      saved={c.req.query("saved") === "1"}
    />,
  );
});

admin.post("/sites/:siteId", async (c) => {
  const site = await getSite(c.env.DB, c.req.param("siteId"));
  if (!site) return c.html(siteNotFound, 404);
  const { values, input, errors } = validateSite(await c.req.parseBody());
  if (!input) {
    return c.html(
      <SitePage email={c.get("admin")} site={site} origin={new URL(c.req.url).origin} values={values} errors={errors} />,
      400,
    );
  }
  // The website's short name stays the same, so its footer links keep working.
  await updateSite(c.env.DB, site.id, input, new Date());
  return c.redirect(`/admin/sites/${site.id}?saved=1`, 303);
});

admin.get("/sites/:siteId/delete", async (c) => {
  const site = await getSite(c.env.DB, c.req.param("siteId"));
  if (!site) return c.html(siteNotFound, 404);
  const counts = await reportCountsBySite(c.env.DB);
  return c.html(<DeleteSitePage email={c.get("admin")} site={site} reportCount={counts[site.id] ?? 0} />);
});

admin.post("/sites/:siteId/delete", async (c) => {
  const site = await getSite(c.env.DB, c.req.param("siteId"));
  if (!site) return c.html(siteNotFound, 404);
  await deleteSite(c.env.DB, site.id);
  return c.redirect(`/admin/sites?deleted=${encodeURIComponent(new URL(site.website).host)}`, 303);
});

export default admin;
