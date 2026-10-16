# Open Accessibility Toolkit portal

A free, self-hosted portal where visitors report accessibility problems with your
website, and where you keep a dated record of every report and what you did about it.
Each website owner runs their own copy in their own free Cloudflare account; nobody
else sees the reports.

The portal records and organizes reports. It does not make a website "compliant";
fixing the website does that.

**Status:** early, and live. All the main pieces work: the report form, emails, your login
and inbox, your websites, the public accessibility statement, and footer links. Coming
next: a one-click "Deploy to Cloudflare" button and a step-by-step guide for people who
don't code.

**Live demo:** the [report form](https://open-a11y-portal.openaccessibilitytoolkit.workers.dev/report/joesbakery-example)
and [accessibility statement](https://open-a11y-portal.openaccessibilitytoolkit.workers.dev/statement/joesbakery-example)
for a pretend bakery. Reports sent there reach the project team; please only send test reports.

## What works so far

- `/report/<website-id>`: the "Report an accessibility problem" form. It asks what went
  wrong (required), which page, how the visitor was using the site (optional), and
  their email (optional).
- A thank-you page with a reference number, such as R-0042.
- Every report is saved with a timeline, starting with when it was received.
- Safeguards without puzzles: a hidden field robots fill in, a minimum time to fill the
  form, and at most 5 reports per visitor per hour. Visitors' IP addresses are never
  stored; only a salted hash is kept, for the rate limit.
- **Emails, through Resend** (free plan: 100 a day):
  - **To you:** "New accessibility report R-0042 for Joe's Bakery", with everything the
    visitor sent. Replying to it answers the visitor. It goes to the website's contact
    email plus any extra addresses in `notify_emails`.
  - **To the visitor** (only if they gave an email): a fixed thank-you with their reference
    number and your reply time. It never repeats what they typed, so it can't be misused to
    send messages to strangers. At most one per address per day.
  - After 90 emails in a day, auto-replies pause but you're still notified.
  - Emails go out after the visitor sees the thank-you page. Every email sent, skipped or
    failed is written to the report's timeline.
  - Without an email key, reports are still saved and the timeline says email isn't set up.
- **Your login** at `/admin`: no passwords. Type your email and get a one-time link
  (works once, expires in 15 minutes, at most 3 per 15 minutes). The link opens a
  "Log me in" button, so email virus-scanners that open links can't use it up. You stay
  logged in for 7 days. Only addresses in `ADMIN_EMAILS` can log in, and the login page
  answers everyone the same way, so nobody can find out who the admins are.
- **Your inbox:** every report from all your websites, newest first, with counts by
  status and filters by website and status.
- **Each report's page:** everything the visitor sent, a status (New, In progress,
  Fixed), notes, and a timeline of what happened, when, and who did it.
- **Your websites** at `/admin/sites`: add, edit or delete websites. Each one has its
  contact email, reply time, optional phone, extra people to email about new reports,
  and problems you already know about. Deleting a website also deletes its reports,
  after a clear warning.
- **A public accessibility statement** for each website at `/statement/<website-id>`.
  It uses the structure W3C recommends, always says "partially conforms" (never
  "compliant"), lists your known problems, links to the report form, and updates the
  moment you change your settings.
- **Footer links ready to copy** on each website's page ("Accessibility statement" and
  "Report an accessibility problem"), with steps for WordPress, Squarespace, Wix and
  Shopify. Plain links only: no widget, no script.
- **Delete** a report and its timeline permanently, after an "Are you sure?" page.
- **Download a spreadsheet** (CSV) of all reports. Cells that start like a formula are
  made safe, so a visitor's text can't run as a formula in Excel.
- Times are shown in the `TIME_ZONE` you choose (default: US Eastern).
- No JavaScript, strict security headers, and every page passes the toolkit's own
  WCAG 2.2 AA scan, including the error state.

## Try it on your computer

Requires Node.js 22.12 or newer.

```bash
cd portal
npm install
npm run types
npm run db:local
npm run dev
```

Then open http://localhost:8787/report/joesbakery-com (a demo website added by
`seed/dev.sql`).

### Settings

In `wrangler.jsonc` under `vars`: `TIME_ZONE` (for example `America/Chicago`) and
`EMAIL_FROM`. Private settings go in `.dev.vars` on your computer (copy
`.dev.vars.example`), or `wrangler secret put` on Cloudflare: `ADMIN_EMAILS` (who can
log in, separated by commas), `HASH_SALT` (long random text) and `RESEND_API_KEY`.

### Sending real emails on your computer

1. In Resend, create an API key with **Sending access** only.
2. Copy `.dev.vars.example` to `.dev.vars` and replace `re_your_key_here` with your key.
   `.dev.vars` is never committed. Never paste the key anywhere else.
3. Restart `npm run dev`.

Without your own domain verified in Resend, emails come from `onboarding@resend.dev` and
only reach your own Resend account's address. Anything else is recorded in the timeline
as a failed email.

## Put your own copy on Cloudflare (command line)

For developers. A step-by-step guide for everyone else is coming.

1. Sign in to Cloudflare: `npx wrangler login`. On Windows, if the browser can't reach
   `localhost` afterwards, use `npx wrangler login --device` instead. If PowerShell
   blocks `npx`, type `npx.cmd`.
2. Publish, which also creates the database and its tables: `npm run deploy`
3. Store the private settings (each command asks you to paste the value):
   ```bash
   npx wrangler secret put ADMIN_EMAILS
   npx wrangler secret put HASH_SALT
   npx wrangler secret put RESEND_API_KEY
   ```
   `HASH_SALT` is any long random text. Until it's set, the portal shows "This portal
   isn't set up yet" instead of storing visitors' details unprotected.
4. Optional: change `EMAIL_FROM` and `TIME_ZONE` in `wrangler.jsonc`, then publish again.
5. Go to `https://<your-portal>.workers.dev/admin`, log in, and add your website under
   **Websites**.

## Tests

```bash
npm run typecheck
npm test
```

Tests run inside Cloudflare's Workers runtime on your computer, with a fresh local
database. They never use a real email key, even if `.dev.vars` has one.

## Why Cloudflare

Cloudflare's free plan allows business use and includes a database (D1) that doesn't
pause when quiet. Vercel's free plan is for non-commercial use only, and a free Supabase
database pauses after a week without activity, which could lose reports.
