# Open Accessibility Toolkit portal

A free, self-hosted portal where visitors report accessibility problems with your
website, and where you keep a dated record of every report and what you did about it.
Each website owner runs their own copy in their own free Cloudflare account; nobody
else sees the reports.

The portal records and organizes reports. It does not make a website "compliant";
fixing the website does that.

**Status:** early. The report form works. Coming next: emails (an automatic reply to the
visitor and a notification to you), your login and inbox, managing your websites, and a
step-by-step setup guide for people who don't code.

## What works so far

- `/report/<website-id>`: the "Report an accessibility problem" form. It asks what went
  wrong (required), which page, how the visitor was using the site (optional), and
  their email (optional).
- A thank-you page with a reference number, such as R-0042.
- Every report is saved with a timeline, starting with when it was received.
- Safeguards without puzzles: a hidden field robots fill in, a minimum time to fill the
  form, and at most 5 reports per visitor per hour. Visitors' IP addresses are never
  stored; only a salted hash is kept, for the rate limit.
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

## Tests

```bash
npm run typecheck
npm test
```

Tests run inside Cloudflare's Workers runtime on your computer, with a fresh local
database.

## Why Cloudflare

Cloudflare's free plan allows business use and includes a database (D1) that doesn't
pause when quiet. Vercel's free plan is for non-commercial use only, and a free Supabase
database pauses after a week without activity, which could lose reports.
