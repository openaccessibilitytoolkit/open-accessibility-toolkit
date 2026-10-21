// The owner's part of the portal, under /admin. Everything except logging in
// needs a valid session.

import { Hono, type Context, type MiddlewareHandler } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import {
  ViewerContext,
  canLogIn,
  canManagePeople,
  canManageWebsites,
  canSeeSite,
  getViewer,
  visibleSites,
  type Viewer,
} from "./access.js";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { csrf } from "hono/csrf";
import { DeletePage, InboxPage, LoginPage, ReportPage, VerifyPage } from "./admin.js";
import {
  LOGIN_LINK_MINUTES,
  adminEmails,
  SESSION_COOKIE,
  SESSION_DAYS,
  consumeLoginToken,
  createLoginToken,
  createSession,
  deleteExpired,
  deleteSession,
  getSessionEmail,
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
  getSetting,
  listReviews,
  recordReview,
  setSetting,
  reportCountsBySite,
  updateSite,
  getReport,
  listEvents,
  listReports,
  listSites,
  reference,
  updateReport,
  type Site,
  addPerson,
  changePersonAccess,
  getPerson,
  listPeople,
  listPeopleEvents,
  removePerson,
} from "./db.js";
import {
  PORTAL_ORIGIN_SETTING,
  invitationEmail,
  sendInvitation,
  sendLoginEmail,
  sendTestEmail,
  type TestEmailResult,
} from "./email.js";
import { SETUP_GUIDE_URL, SetupPage, checkFooterLinks, type Check, type GithubCopyForm } from "./setup-page.js";
import {
  GITHUB_COPY_SETTING,
  UpdateContext,
  getUpdateStatus,
  parseGithubCopy,
  refreshLatestVersion,
  updateAvailable,
  type UpdateStatus,
} from "./updates.js";
import { Message } from "./pages.js";
import { visitorKey } from "./safeguards.js";
import { EMPTY_SITE_FORM, formValuesFromSite, siteIdFor, validateSite } from "./site-form.js";
import { DeleteSitePage, NewSitePage, ReviewPage, SitePage, SitesPage } from "./sites.js";
import {
  EditPersonPage,
  PeoplePage,
  RemovePersonPage,
  describeAccess,
  parsePersonForm,
  personAccess,
  type AccessChoice,
  type PersonFormError,
} from "./people.js";
import { longDate } from "./statement.js";
import { COPY_SCRIPT } from "./copy-script.js";
import { STATUSES, formatTime, isStatus } from "./timeline.js";
import { ASSISTIVE_TECH, isEmail, type AssistiveTech } from "./validate.js";

const PAGE_SIZE = 50;
/** Login link requests allowed per visitor per hour, whatever address they type. */
const LOGIN_REQUESTS_PER_HOUR = 10;
const HOUR = 60 * 60 * 1000;

type AdminEnv = { Bindings: Bindings; Variables: { admin: string; viewer: Viewer; update: UpdateStatus | null } };
const admin = new Hono<AdminEnv>();

/**
 * Renders an owner page, letting the menu know who's looking (so it only shows what they can
 * use) and, for portal owners, whether an update is available.
 */
function page(c: Context<AdminEnv>, content: JSX.Element, status: 200 | 400 | 403 | 404 = 200) {
  return c.html(
    <ViewerContext.Provider value={c.get("viewer")}>
      <UpdateContext.Provider value={c.get("update") ?? null}>{content}</UpdateContext.Provider>
    </ViewerContext.Provider>,
    status,
  );
}

// Other websites can't submit forms here on your behalf (checks the Origin header).
admin.use(csrf());
// Private pages are never kept in shared caches.
admin.use(async (c, next) => {
  await next();
  if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "no-store");
});

// ---- Logging in and out ----

// The copy-button script. Public (it contains nothing private), cached for an hour so updates arrive quickly.
admin.get("/copy.js", (c) =>
  c.body(COPY_SCRIPT, 200, {
    "Content-Type": "text/javascript; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  }),
);

admin.get("/login", (c) => c.html(<LoginPage />));

admin.post("/login", async (c) => {
  const form = await c.req.parseBody();
  const email = String(form.email ?? "").trim().toLowerCase();
  if (!isEmail(email)) {
    return c.html(<LoginPage error="Please type your email address, like name@example.com" email={email} />, 400);
  }
  const now = Date.now();
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const requests = await countSubmission(c.env.DB, await visitorKey(ip, "login", c.env.HASH_SALT!), now, HOUR);
  // The answer is the same whether or not the address can log in, so nobody can find out who the admins are.
  if (requests <= LOGIN_REQUESTS_PER_HOUR && (await canLogIn(c.env.DB, c.env.ADMIN_EMAILS, email))) {
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
  if (!email || !(await canLogIn(c.env.DB, c.env.ADMIN_EMAILS, email))) {
    return c.html(
      <Message title="This login link doesn't work" link={{ href: "/admin/login", text: "Get a new login link" }}>
        Login links work once and expire after 15 minutes. Please ask for a new one.
      </Message>,
      400,
    );
  }
  await deleteExpired(c.env.DB, Date.now());
  // Remember the portal's own address, so the monthly review email can link back here.
  await setSetting(c.env.DB, PORTAL_ORIGIN_SETTING, new URL(c.req.url).origin);
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
  const token = getCookie(c, SESSION_COOKIE, "host");
  const email = await getSessionEmail(c.env.DB, token, Date.now());
  const viewer = email ? await getViewer(c.env.DB, c.env.ADMIN_EMAILS, email) : null;
  if (!viewer) {
    // Removed from the portal (or never allowed): end the session straight away.
    await deleteSession(c.env.DB, token);
    return c.redirect("/admin/login", 303);
  }
  c.set("admin", viewer.email);
  c.set("viewer", viewer);
  // Only portal owners are told about updates (they're the ones who can run them).
  c.set("update", viewer.owner ? await getUpdateStatus(c.env.DB) : null);
  // Remember the portal's own address (for the monthly review email's links). Admins who
  // stay logged in never pass through the login page, so check on every visit.
  const origin = new URL(c.req.url).origin;
  if ((await getSetting(c.env.DB, PORTAL_ORIGIN_SETTING)) !== origin) {
    await setSetting(c.env.DB, PORTAL_ORIGIN_SETTING, origin);
  }
  await next();
});

// ---- Who can use which pages ----

const notAllowed = (
  <Message title="You don't have access to this page" link={{ href: "/admin", text: "Back to your reports" }}>
    Ask a portal owner if you need access.
  </Message>
);

/** Adding and deleting websites, and Check my setup: only people who see every website. */
const websiteManagersOnly: MiddlewareHandler<AdminEnv> = async (c, next) => {
  if (!canManageWebsites(c.get("viewer"))) return page(c, notAllowed, 403);
  await next();
};
admin.use("/sites/new", websiteManagersOnly);
admin.post("/sites", websiteManagersOnly);
admin.use("/sites/:siteId/delete", websiteManagersOnly);
admin.use("/setup", websiteManagersOnly);
admin.use("/setup/*", websiteManagersOnly);

/** The People page: only portal owners. */
const ownersOnly: MiddlewareHandler<AdminEnv> = async (c, next) => {
  if (!canManagePeople(c.get("viewer"))) return page(c, notAllowed, 403);
  await next();
};
admin.use("/people", ownersOnly);
admin.use("/people/*", ownersOnly);

admin.get("/", async (c) => {
  const viewer = c.get("viewer");
  const allowedSiteIds = viewer.allSites ? undefined : viewer.siteIds;
  const requestedSite = c.req.query("site") || undefined;
  const site = requestedSite && canSeeSite(viewer, requestedSite) ? requestedSite : undefined;
  const statusParam = c.req.query("status");
  const status = isStatus(statusParam) ? statusParam : undefined;
  const pageNumber = Math.max(1, Number.parseInt(c.req.query("page") ?? "1", 10) || 1);
  const filter = { siteId: site, status, allowedSiteIds };
  const [rows, counts, sites] = await Promise.all([
    listReports(c.env.DB, filter, PAGE_SIZE + 1, (pageNumber - 1) * PAGE_SIZE),
    countByStatus(c.env.DB, site, allowedSiteIds),
    listSites(c.env.DB),
  ]);
  const deleted = c.req.query("deleted");
  return page(
    c,
    <InboxPage
      email={c.get("admin")}
      reports={rows.slice(0, PAGE_SIZE)}
      hasMore={rows.length > PAGE_SIZE}
      counts={counts}
      sites={visibleSites(viewer, sites)}
      filter={filter}
      page={pageNumber}
      timeZone={c.env.TIME_ZONE}
      deleted={deleted && /^R-\d{4,}$/.test(deleted) ? deleted : undefined}
    />,
  );
});

admin.get("/reports.csv", async (c) => {
  const viewer = c.get("viewer");
  const rows = await listReports(c.env.DB, { allowedSiteIds: viewer.allSites ? undefined : viewer.siteIds }, 1_000_000, 0);
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

/** The report in the address, or null if it doesn't exist or this person can't see its website. */
async function findReport(c: Context<AdminEnv>) {
  const id = Number.parseInt(c.req.param("id") ?? "", 10);
  const report = Number.isFinite(id) ? await getReport(c.env.DB, id) : null;
  return report && canSeeSite(c.get("viewer"), report.site_id) ? report : null;
}

/** The website in the address, or null if it doesn't exist or this person can't see it. */
async function findSite(c: Context<AdminEnv>) {
  const site = await getSite(c.env.DB, c.req.param("siteId") ?? "");
  return site && canSeeSite(c.get("viewer"), site.id) ? site : null;
}

const notFound = <Message title="Report not found" link={{ href: "/admin", text: "Back to all reports" }}>
  That report doesn't exist. It may have been deleted.
</Message>;

admin.get("/reports/:id", async (c) => {
  const report = await findReport(c);
  if (!report) return page(c, notFound, 404);
  return page(
    c,
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
  if (!report) return page(c, notFound, 404);
  const form = await c.req.parseBody();
  const status = isStatus(form.status) ? form.status : report.status;
  const note = String(form.note ?? "").trim();
  if (note.length > 2000) {
    return page(
    c,
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
  if (!report) return page(c, notFound, 404);
  return page(c, <DeletePage email={c.get("admin")} report={report} />);
});

admin.post("/reports/:id/delete", async (c) => {
  const report = await findReport(c);
  if (!report) return page(c, notFound, 404);
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
  return page(
    c,
    <SitesPage
      email={c.get("admin")}
      sites={visibleSites(c.get("viewer"), sites)}
      counts={counts}
      canAdd={canManageWebsites(c.get("viewer"))}
      deleted={deleted && /^[a-z0-9.-]{1,253}$/i.test(deleted) ? deleted : undefined}
    />,
  );
});

admin.get("/sites/new", (c) => page(c, <NewSitePage email={c.get("admin")} values={EMPTY_SITE_FORM} errors={[]} />));

admin.post("/sites", async (c) => {
  const { values, input, errors } = validateSite(await c.req.parseBody());
  if (!input) return page(c, <NewSitePage email={c.get("admin")} values={values} errors={errors} />, 400);
  const id = siteIdFor(input.website);
  if (await getSite(c.env.DB, id)) {
    const duplicate = [{ field: "website" as const, message: `${new URL(input.website).host} is already set up in this portal.` }];
    return page(c, <NewSitePage email={c.get("admin")} values={values} errors={duplicate} />, 400);
  }
  const now = new Date();
  await createSite(c.env.DB, id, input, now);
  await recordReview(c.env.DB, id, "updated", c.get("admin"), now);
  return c.redirect(`/admin/sites/${id}?saved=1`, 303);
});

admin.get("/sites/:siteId", async (c) => {
  const site = await findSite(c);
  if (!site) return page(c, siteNotFound, 404);
  return page(
    c,
    <SitePage
      email={c.get("admin")}
      site={site}
      origin={new URL(c.req.url).origin}
      values={formValuesFromSite(site)}
      errors={[]}
      saved={c.req.query("saved") === "1"}
      timeZone={c.env.TIME_ZONE}
    />,
  );
});

admin.post("/sites/:siteId", async (c) => {
  const site = await findSite(c);
  if (!site) return page(c, siteNotFound, 404);
  const { values, input, errors } = validateSite(await c.req.parseBody());
  if (!input) {
    return page(
    c,
      <SitePage
        email={c.get("admin")}
        site={site}
        origin={new URL(c.req.url).origin}
        values={values}
        errors={errors}
        timeZone={c.env.TIME_ZONE}
      />,
      400,
    );
  }
  // The website's short name stays the same, so its footer links keep working.
  const now = new Date();
  await updateSite(c.env.DB, site.id, input, now);
  // Saving the details counts as reviewing the statement.
  await recordReview(c.env.DB, site.id, "updated", c.get("admin"), now);
  return c.redirect(`/admin/sites/${site.id}?saved=1`, 303);
});

admin.get("/sites/:siteId/review", async (c) => {
  const site = await findSite(c);
  if (!site) return page(c, siteNotFound, 404);
  return page(
    c,
    <ReviewPage
      email={c.get("admin")}
      site={site}
      reviews={await listReviews(c.env.DB, site.id)}
      timeZone={c.env.TIME_ZONE}
      done={c.req.query("done") === "1"}
    />,
  );
});

admin.post("/sites/:siteId/review", async (c) => {
  const site = await findSite(c);
  if (!site) return page(c, siteNotFound, 404);
  await recordReview(c.env.DB, site.id, "confirmed", c.get("admin"), new Date());
  return c.redirect(`/admin/sites/${site.id}/review?done=1`, 303);
});

admin.get("/sites/:siteId/delete", async (c) => {
  const site = await findSite(c);
  if (!site) return page(c, siteNotFound, 404);
  const counts = await reportCountsBySite(c.env.DB);
  return page(c, <DeleteSitePage email={c.get("admin")} site={site} reportCount={counts[site.id] ?? 0} />);
});

admin.post("/sites/:siteId/delete", async (c) => {
  const site = await findSite(c);
  if (!site) return page(c, siteNotFound, 404);
  await deleteSite(c.env.DB, site.id);
  return c.redirect(`/admin/sites?deleted=${encodeURIComponent(new URL(site.website).host)}`, 303);
});

// ---- Check my setup ----

function validTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** A statement counts as overdue for review after this many days. */
const REVIEW_OVERDUE_DAYS = 35;

/** One "needs attention" check per website whose statement hasn't been reviewed recently. */
function reviewChecks(sites: Site[], timeZone: string, now = Date.now()): Check[] {
  const overdue = sites.filter((s) => {
    const last = Date.parse(s.reviewed_at ?? s.updated_at ?? "");
    return !Number.isFinite(last) || now - last > REVIEW_OVERDUE_DAYS * 24 * 60 * 60 * 1000;
  });
  if (sites.length > 0 && overdue.length === 0) {
    return [
      {
        state: "done",
        title: "Statements reviewed this month",
        detail: "You'll get a reminder email at the start of each month to review them again.",
      },
    ];
  }
  return overdue.map((s) => ({
    state: "attention",
    title: `The statement for ${new URL(s.website).host} needs its monthly review`,
    detail: `It was last reviewed on ${longDate(s.reviewed_at ?? s.updated_at, timeZone)}. It takes about 10 seconds.`,
    link: { href: `/admin/sites/${s.id}/review`, text: `Review ${new URL(s.website).host}` },
  }));
}

async function setupPage(
  c: Context<AdminEnv>,
  options: { testResult?: TestEmailResult; notice?: string; githubForm?: GithubCopyForm } = {},
) {
  const env = c.env;
  const viewer = c.get("viewer");
  const origin = new URL(c.req.url).origin;
  const sites = await listSites(env.DB);
  const admins = adminEmails(env.ADMIN_EMAILS);
  const fromAddress = /<([^>]+)>/.exec(env.EMAIL_FROM)?.[1] ?? env.EMAIL_FROM;
  const fromDomain = fromAddress.split("@")[1] ?? "";
  const checks: Check[] = [
    {
      state: "done",
      title: "You can log in",
      detail: `People who can log in: ${admins.join(", ")}. To change this, update ADMIN_EMAILS in Cloudflare.`,
    },
    env.RESEND_API_KEY
      ? { state: "done", title: "Email is connected", detail: "New reports are emailed to you, and visitors get a confirmation." }
      : {
          state: "attention",
          title: "Email isn't connected",
          detail: "Reports are still saved here, but nobody is emailed. Add your Resend key as RESEND_API_KEY in Cloudflare.",
          link: { href: `${SETUP_GUIDE_URL}#3-get-your-resend-key`, text: "How to get a Resend key" },
        },
    fromDomain === "resend.dev"
      ? {
          state: "attention",
          title: "You're using Resend's test address",
          detail:
            "Emails only reach the address you signed up to Resend with, so visitors won't get automatic replies. Verify your domain in Resend, then change EMAIL_FROM.",
          link: { href: `${SETUP_GUIDE_URL}#7-verify-your-domain-in-resend`, text: "How to verify your domain" },
        }
      : {
          state: "done",
          title: `Emails come from ${fromAddress}`,
          detail: "Send yourself a test email below to make sure this domain is verified in Resend.",
        },
    sites.length > 0
      ? { state: "done", title: `${sites.length} website${sites.length === 1 ? "" : "s"} added`, detail: "Visitors can report problems and read your statement." }
      : {
          state: "attention",
          title: "No websites added yet",
          detail: "Add your website to get its report form, accessibility statement and footer links.",
          link: { href: "/admin/sites/new", text: "Add a website" },
        },
    ...reviewChecks(sites, env.TIME_ZONE),
    validTimeZone(env.TIME_ZONE)
      ? { state: "done", title: `Times are shown in ${env.TIME_ZONE}`, detail: "To change this, update TIME_ZONE in Cloudflare." }
      : { state: "attention", title: `"${env.TIME_ZONE}" isn't a time zone we recognize`, detail: "Use a name like America/New_York or Europe/London. Times are shown in UTC until then." },
  ];
  // Cloudflare's free plan allows about 50 outside requests per page, so the websites share 30 script reads.
  const checked = sites.slice(0, 10);
  const scriptsEach = Math.floor(30 / Math.max(checked.length, 1));
  const footers = await Promise.all(checked.map((site) => checkFooterLinks(site, origin, scriptsEach)));
  return (
    <SetupPage
      email={viewer.email}
      checks={checks}
      footers={footers}
      emailConnected={!!env.RESEND_API_KEY}
      testResult={options.testResult}
      notice={options.notice}
      update={c.get("update") ?? (await getUpdateStatus(env.DB))}
      timeZone={env.TIME_ZONE}
      isOwner={viewer.owner}
      githubForm={options.githubForm}
    />
  );
}

admin.get("/setup", async (c) => {
  const copy = c.get("update")?.githubCopy;
  const notice =
    c.req.query("saved") === "github"
      ? copy
        ? `Saved. Update my portal now opens github.com/${copy}.`
        : "Removed your portal's GitHub address."
      : undefined;
  return page(c, await setupPage(c, { notice }));
});

/** Asks GitHub for the latest version now, instead of waiting for the daily check. */
admin.post("/setup/check-updates", async (c) => {
  const before = (await getUpdateStatus(c.env.DB)).latest;
  // At most once a minute, whoever asks.
  const recent = before && Date.now() - Date.parse(before.checkedAt) < 60 * 1000;
  const latest = recent ? before : await refreshLatestVersion(c.env.DB, new Date());
  const update = await getUpdateStatus(c.env.DB);
  if (c.get("viewer").owner) c.set("update", update);
  if (!latest) {
    return page(
      c,
      await setupPage(c, { testResult: { ok: false, message: "We couldn't reach GitHub to check for updates. Please try again later." } }),
    );
  }
  const notice = updateAvailable(update)
    ? `Version ${latest.version} is available. See Updates below.`
    : `You're on the latest version (${update.current}).`;
  return page(c, await setupPage(c, { notice }));
});

/** Saves the owner's copy on GitHub, so Update my portal opens its update page. Owners only. */
admin.post("/setup/github-copy", async (c) => {
  if (!c.get("viewer").owner) return page(c, notAllowed, 403);
  const form = await c.req.parseBody();
  const value = typeof form.github_copy === "string" ? form.github_copy.trim().slice(0, 300) : "";
  if (value === "") {
    await setSetting(c.env.DB, GITHUB_COPY_SETTING, "");
    return c.redirect("/admin/setup?saved=github#updates", 303);
  }
  const copy = parseGithubCopy(value);
  if (!copy) {
    const githubForm = { value, error: "Please paste your portal's GitHub address, like https://github.com/your-name/open-a11y-portal" };
    return page(c, await setupPage(c, { githubForm }), 400);
  }
  await setSetting(c.env.DB, GITHUB_COPY_SETTING, copy);
  return c.redirect("/admin/setup?saved=github#updates", 303);
});

admin.post("/setup/test-email", async (c) => {
  const email = c.get("admin");
  const tries = await countSubmission(c.env.DB, await visitorKey(email, "test-email", c.env.HASH_SALT!), Date.now(), HOUR);
  const result: TestEmailResult =
    tries > 5
      ? { ok: false, message: "You've sent several test emails in the last hour. Please wait a little and try again." }
      : await sendTestEmail(c.env, email);
  return page(c, await setupPage(c, { testResult: result }), result.ok ? 200 : 400);
});

// ---- People ----

async function peoplePage(
  c: Context<AdminEnv>,
  options: { notice?: string; form?: { email: string; access: AccessChoice; errors: PersonFormError[] } } = {},
) {
  const [people, sites, events] = await Promise.all([listPeople(c.env.DB), listSites(c.env.DB), listPeopleEvents(c.env.DB)]);
  return (
    <PeoplePage
      email={c.get("admin")}
      owners={adminEmails(c.env.ADMIN_EMAILS)}
      people={people}
      sites={sites}
      events={events}
      timeZone={c.env.TIME_ZONE}
      notice={options.notice}
      form={options.form}
    />
  );
}

const personNotFound = (
  <Message title="Person not found" link={{ href: "/admin/people", text: "Back to People" }}>
    That person isn't on the list. They may already have been removed.
  </Message>
);

async function findPerson(c: Context<AdminEnv>) {
  return getPerson(c.env.DB, decodeURIComponent(c.req.param("email") ?? "").toLowerCase());
}

admin.get("/people", async (c) => {
  const added = c.req.query("added");
  const invited = c.req.query("invited") === "1";
  const removed = c.req.query("removed");
  const changed = c.req.query("changed");
  const clean = (v: string | undefined) => (v && /^[^s<>"]{3,254}$/.test(v) ? v : undefined);
  const notice = clean(added)
    ? invited
      ? `${added} was added and sent an invitation email.`
      : `${added} was added, but the invitation email couldn't be sent. Ask them to go to ${new URL(c.req.url).origin}/admin/login and type their email address.`
    : clean(removed)
      ? `${removed} was removed and logged out.`
      : clean(changed)
        ? `What ${changed} can see was updated.`
        : undefined;
  return page(c, await peoplePage(c, { notice }));
});

admin.post("/people", async (c) => {
  const sites = await listSites(c.env.DB);
  const parsed = parsePersonForm(await c.req.parseBody({ all: true }), sites, true);
  const errors = [...parsed.errors];
  if (errors.length === 0 && adminEmails(c.env.ADMIN_EMAILS).includes(parsed.email)) {
    errors.push({ field: "email", message: `${parsed.email} is already a portal owner.` });
  }
  if (errors.length === 0 && (await getPerson(c.env.DB, parsed.email))) {
    errors.push({ field: "email", message: `${parsed.email} has already been added.` });
  }
  if (errors.length > 0) {
    return page(c, await peoplePage(c, { form: { email: parsed.email, access: parsed.access, errors } }), 400);
  }
  const canSee = describeAccess(parsed.access, sites);
  await addPerson(c.env.DB, parsed.email, { ...parsed.access, detail: canSee }, c.get("admin"), new Date());
  const invited = await sendInvitation(
    c.env,
    invitationEmail(parsed.email, c.get("admin"), new URL(c.req.url).origin, canSee.replace(/^Only /, "")),
  );
  return c.redirect(`/admin/people?added=${encodeURIComponent(parsed.email)}&invited=${invited ? 1 : 0}`, 303);
});

admin.get("/people/:email", async (c) => {
  const person = await findPerson(c);
  if (!person) return page(c, personNotFound, 404);
  return page(
    c,
    <EditPersonPage
      email={c.get("admin")}
      person={person}
      sites={await listSites(c.env.DB)}
      access={personAccess(person)}
      errors={[]}
    />,
  );
});

admin.post("/people/:email", async (c) => {
  const person = await findPerson(c);
  if (!person) return page(c, personNotFound, 404);
  const sites = await listSites(c.env.DB);
  const parsed = parsePersonForm(await c.req.parseBody({ all: true }), sites, false);
  if (parsed.errors.length > 0) {
    return page(
      c,
      <EditPersonPage email={c.get("admin")} person={person} sites={sites} access={parsed.access} errors={parsed.errors} />,
      400,
    );
  }
  await changePersonAccess(
    c.env.DB,
    person.email,
    { ...parsed.access, detail: describeAccess(parsed.access, sites) },
    c.get("admin"),
    new Date(),
  );
  return c.redirect(`/admin/people?changed=${encodeURIComponent(person.email)}`, 303);
});

admin.get("/people/:email/remove", async (c) => {
  const person = await findPerson(c);
  if (!person) return page(c, personNotFound, 404);
  return page(c, <RemovePersonPage email={c.get("admin")} person={person} />);
});

admin.post("/people/:email/remove", async (c) => {
  const person = await findPerson(c);
  if (!person) return page(c, personNotFound, 404);
  await removePerson(c.env.DB, person.email, c.get("admin"), new Date());
  return c.redirect(`/admin/people?removed=${encodeURIComponent(person.email)}`, 303);
});

export default admin;
