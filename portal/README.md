# Open Accessibility Toolkit portal

A free, self-hosted portal where visitors report accessibility problems with your
website, and where you keep a dated record of every report and what you did about it.
Each website owner runs their own copy in their own free Cloudflare account; nobody
else sees the reports.

The portal records and organizes reports. It does not make a website "compliant";
fixing the website does that.

**Use at your own risk.** The portal is free and comes with no promises or guarantees,
and it isn't legal advice. You're responsible for your own portal and the visitor
information it collects. See the
[disclaimer](https://github.com/openaccessibilitytoolkit/open-accessibility-toolkit/blob/main/DISCLAIMER.md).

## Get your own portal (free)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/openaccessibilitytoolkit/open-accessibility-toolkit/tree/main/portal)

New to this? Follow the **[step-by-step setup guide](https://github.com/openaccessibilitytoolkit/open-accessibility-toolkit/blob/main/docs/setup-guide.md)**.
No coding needed: three free accounts, one button, about 30 minutes.

**Already have a portal?** Your copy doesn't get fixes by itself. Update it with one click:
see **[Keep your portal safe and up to date](https://github.com/openaccessibilitytoolkit/open-accessibility-toolkit/blob/main/docs/setup-guide.md#9-keep-your-portal-safe-and-up-to-date)**.
To report a security problem, see [SECURITY.md](https://github.com/openaccessibilitytoolkit/open-accessibility-toolkit/blob/main/SECURITY.md).

**Status:** early, and live.

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
- **Monthly statement review:** in the first week of each month, one email to all admins
  (through Resend) lists every website with a **Review** link. One click on **Yes, it's
  still accurate** records the review with the date and who did it, and the public
  statement shows "last reviewed on" that date. Saving a website's details also counts.
  The date is never changed automatically, so it always reflects a real review. A daily
  Cloudflare schedule (`triggers.crons` in `wrangler.jsonc`) sends it once a month and
  retries the next day if email fails.
- **People** at `/admin/people` (owners only): add people by email with an invitation,
  choose whether each person sees **all websites** or **only chosen websites**, change it
  later, or remove them (they're logged out at once). Everything is recorded with who did
  it. People limited to some websites can't see, change, download or delete anything
  belonging to other websites, even by guessing addresses, and don't get **Check my
  setup**, adding or deleting websites, or **People**. Owners (`ADMIN_EMAILS`) can't be
  removed from the page.
- **Check my setup** at `/admin/setup`: plain "Done" / "Needs attention" checks for login,
  email, the sending address, websites and time zone, a **Send me a test email** button
  that explains Resend errors in plain words, and a check that your footer links are
  really on each website's home page.
- **No privacy key to invent:** the portal creates its own random key the first time it
  runs and keeps it in its database. (A `HASH_SALT` secret overrides it if you set one.)
- **Copy buttons** on each website's page for the footer code and both web addresses.
  They come from one small script the portal serves itself (`/admin/copy.js`), which only
  owner pages may run. If the browser blocks the clipboard, it tries the older copy
  command, and if that fails too, it says so. Without the script, the buttons stay hidden.
- No JavaScript on visitors' pages (owner pages only run the copy script), strict
  security headers, and every page passes the toolkit's own
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

All settings are private settings, explained in `.dev.vars.example`: `ADMIN_EMAILS` (who
can log in, separated by commas), `RESEND_API_KEY`, `EMAIL_FROM` (default: Resend's test
address) and `TIME_ZONE` (default: `America/New_York`). On your computer, put them in
`.dev.vars`. On Cloudflare, set them under your Worker's **Settings**, **Variables and
Secrets** (or with `wrangler secret put`). Publishing an update never overwrites them.

### Sending real emails on your computer

1. In Resend, create an API key with **Sending access** only.
2. Copy `.dev.vars.example` to `.dev.vars` and replace `re_your_key_here` with your key.
   `.dev.vars` is never committed. Never paste the key anywhere else.
3. Restart `npm run dev`.

Without your own domain verified in Resend, emails come from `onboarding@resend.dev` and
only reach your own Resend account's address. Anything else is recorded in the timeline
as a failed email.

## Put your own copy on Cloudflare (command line)

For developers. Everyone else, use the
[step-by-step setup guide](https://github.com/openaccessibilitytoolkit/open-accessibility-toolkit/blob/main/docs/setup-guide.md).

1. Sign in to Cloudflare: `npx wrangler login`. On Windows, if the browser can't reach
   `localhost` afterwards, use `npx wrangler login --device` instead. If PowerShell
   blocks `npx`, type `npx.cmd`.
2. Publish, which also creates the database and its tables: `npm run deploy`
3. Store the private settings (each command asks you to paste the value):
   ```bash
   npx wrangler secret put ADMIN_EMAILS
   npx wrangler secret put RESEND_API_KEY
   ```
4. Optional: `npx wrangler secret put EMAIL_FROM` and `npx wrangler secret put TIME_ZONE`.
5. Go to `https://<your-portal>.workers.dev/admin`, log in, and add your website under
   **Websites**.
6. To update later: get the latest code (`git pull`), then `npm run deploy` again.
   Your data and secrets stay as they are.

### When an update needs a new setting

Owners' `wrangler.jsonc` is never changed by **Update my portal**, because it holds their
own portal and database names. If a new feature needs a setting there, add it to
`UPGRADES` in `scripts/upgrade-config.mjs`. `npm run deploy` runs that script first, so
each owner's next publish adds the missing setting without touching anything else.
`npm run test:scripts` checks it.

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
