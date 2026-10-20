# Changelog

## Unreleased

- **New: People.** Portal owners can add people by email (with an invitation), choose
  whether each person sees all websites or only chosen ones, change it later, or remove
  them. People limited to some websites can't reach anything belonging to other websites.

## 1.1.0 (2026-10-20)

Adds the free, self-hosted accessibility portal and the accessibility statement generator.

**Portal owners: press "Update my portal" to get this release** (see
[Keep your portal safe and up to date](docs/setup-guide.md#9-keep-your-portal-safe-and-up-to-date)).
Then open **Check my setup** once.

- **New: monthly statement review.** At the start of each month, one email lists all your
  websites. One click on **Yes, it's still accurate** records the review, and your public
  statement shows the real "last reviewed" date. The date never changes by itself.
- **Updates now bring new settings too.** When an update needs a new setting (like the
  schedule for the monthly reminder), the portal adds it automatically when Cloudflare
  publishes it, without changing anything you've set.
- **The portal** (`portal/`): a report-a-problem form for visitors, emails to you and an
  automatic thank-you to the visitor (through Resend), a passwordless login, an inbox
  with statuses, notes and a dated timeline, several websites per portal, a hosted
  accessibility statement for each, copy-ready footer links, **Check my setup**, a
  spreadsheet download, and a calmer look.
- **One-click setup** with the **Deploy to Cloudflare** button and a step-by-step guide,
  free on Cloudflare's and Resend's free plans.
- **Update my portal** button, two-factor advice, a security policy (`SECURITY.md`) and a
  plain-English disclaimer (`DISCLAIMER.md`).
- **Statement generator** in the command-line tool: `open-a11y statement` writes an
  honest accessibility statement and footer links.

## 1.0.0 (2026-10-16)

First release. A free command-line tool and GitHub Action that helps you find and fix
website accessibility issues against WCAG 2.2 Level A and AA.

- **Scans a whole site.** Starts from one address, follows links on the same site
  (up to 25 pages by default, `--max-pages` to change), and checks each page with
  axe-core in a hidden browser.
- **Readable report.** `report.html` groups each kind of problem across pages, most
  serious first, and lists every page checked and any broken links. The report itself
  passes its own accessibility scan.
- **Plain-English explanations** for 37 of the most common problems: what's wrong, who
  it affects, how to fix it, and a before-and-after code example.
- **Free on GitHub.** A reusable Action (`openaccessibilitytoolkit/open-accessibility-toolkit@v1`)
  for scheduled scans, with a summary table on each run and the full report attached.
- **Honest by design.** Automated checks find only some kinds of problems. This tool
  never claims a site is "compliant"; people still need to check the rest.
