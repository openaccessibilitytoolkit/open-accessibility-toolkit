// The portal's web server: routes requests to the right page.

import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import admin from "./admin-routes.js";
import { missingSettings, type Bindings } from "./bindings.js";
import { countSubmission, createReport, getSite, reference } from "./db.js";
import { emailNewReport } from "./email.js";
import { Message, ReportForm, ThankYou } from "./pages.js";
import { RATE_LIMIT, looksAutomated, visitorKey } from "./safeguards.js";
import { StatementPage } from "./statement.js";
import { validateReport } from "./validate.js";

const app = new Hono<{ Bindings: Bindings }>();

// Safe defaults for every page: no scripts at all, no framing by other sites.
app.use(async (c, next) => {
  await next();
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  );
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
});

// A portal without its private settings can't protect visitors' privacy, so it stops
// with a clear message instead of quietly misbehaving.
app.use(async (c, next) => {
  const missing = missingSettings(c.env);
  if (missing.length === 0) return next();
  console.error(`The portal is missing these private settings: ${missing.join(", ")}`);
  return c.html(
    <Message title="This portal isn't set up yet">
      {`The portal's owner needs to finish setting it up. Missing setting: ${missing.join(", ")}.`}
    </Message>,
    503,
  );
});

app.get("/", (c) =>
  c.html(
    <Message title="Accessibility reports">
      This portal receives accessibility problem reports for the websites it looks after.
    </Message>,
  ),
);

app.get("/report/:siteId", async (c) => {
  const site = await getSite(c.env.DB, c.req.param("siteId"));
  if (!site) return c.html(<Message title="Page not found">We couldn't find that report form.</Message>, 404);
  return c.html(<ReportForm site={site} now={Date.now()} />);
});

app.post("/report/:siteId", bodyLimit({ maxSize: 32 * 1024 }), async (c) => {
  const site = await getSite(c.env.DB, c.req.param("siteId"));
  if (!site) return c.html(<Message title="Page not found">We couldn't find that report form.</Message>, 404);

  const form = await c.req.parseBody({ all: true });
  const now = Date.now();
  const thanks = `/report/${site.id}/thanks`;

  // Robots get the normal thank-you page, so they learn nothing, but nothing is saved.
  if (looksAutomated(form, now)) return c.redirect(thanks, 303);

  const { values, errors } = validateReport(form);
  if (errors.length > 0) return c.html(<ReportForm site={site} values={values} errors={errors} now={now} />, 400);

  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const count = await countSubmission(
    c.env.DB,
    await visitorKey(ip, site.id, c.env.HASH_SALT!), // checked by the setup check above
    now,
    RATE_LIMIT.windowMs,
  );
  if (count > RATE_LIMIT.max) {
    return c.html(
      <Message
        title="Please wait a little"
        link={{ href: `mailto:${site.contact_email}`, text: `Email ${site.organization} instead` }}
      >
        {`You've sent several reports in a short time. Please try again in an hour, or email ${site.organization} directly.`}
      </Message>,
      429,
    );
  }

  const id = await createReport(c.env.DB, site.id, values, new Date(now));
  // Emails go out after the visitor sees the thank-you page, so they never wait for them.
  c.executionCtx.waitUntil(
    emailNewReport(c.env, site, id, values, new Date(now), new URL(c.req.url).origin).catch((err) =>
      console.error(`Emails for report ${id} failed`, err),
    ),
  );
  return c.redirect(`${thanks}?ref=${reference(id)}`, 303);
});

app.get("/report/:siteId/thanks", async (c) => {
  const site = await getSite(c.env.DB, c.req.param("siteId"));
  if (!site) return c.html(<Message title="Page not found">We couldn't find that page.</Message>, 404);
  const ref = c.req.query("ref");
  return c.html(<ThankYou site={site} reference={ref && /^R-\d{4,}$/.test(ref) ? ref : undefined} />);
});

app.get("/statement/:siteId", async (c) => {
  const site = await getSite(c.env.DB, c.req.param("siteId"));
  if (!site) return c.html(<Message title="Page not found">We couldn't find that accessibility statement.</Message>, 404);
  return c.html(<StatementPage site={site} timeZone={c.env.TIME_ZONE} />);
});

app.route("/admin", admin);

app.notFound((c) => c.html(<Message title="Page not found">We couldn't find that page.</Message>, 404));

export default app;
