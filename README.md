# Open Accessibility Toolkit (working name)

Free, open-source toolkit that helps website owners **find and fix** accessibility
problems against **WCAG 2.2 AA**, the standard used for ADA (US) and EAA (EU) web
accessibility.

> Automated checks catch only part of WCAG. This toolkit does not make a site
> "compliant" on its own; people still need to verify the rest.
>
> **Use at your own risk.** It's free and comes with no promises or guarantees, and
> it isn't legal advice. See the [disclaimer](DISCLAIMER.md).

## Principles (decided 2026-10-15)

- **Fix at the source, not with an overlay widget.** Overlays (e.g. accessiBe) are
  rejected by accessibility professionals, and the FTC fined accessiBe $1M in 2025
  for claiming its widget made sites compliant.
- **Never claim "compliant" or "lawsuit-proof."** Wording is "helps you find and fix
  accessibility issues." Automated checks catch only part of WCAG; humans must
  verify the rest.
- **Free for everyone.** Prefer designs that run on the user's own machine so
  hosting cost stays near zero.

## Planned pieces

1. Scanner: crawl a site and check WCAG 2.2 AA using axe-core.
2. Plain-English explanations, with the exact code fix for each problem.
3. AI-assisted fixes (alt text, labels, ARIA) as a reviewable patch or GitHub PR.
4. Guided manual checklist for what machines can't check (keyboard, screen reader,
   captions).
5. Generated accessibility statement plus a dated progress report.

## First version: command-line tool (decided 2026-10-15)

A command, `open-a11y scan <url>`, that runs on your own computer (or free in GitHub
Actions), scans a site with axe-core in a hidden browser, and writes a plain-English
report with code fixes.

Tech: Node.js + TypeScript, Playwright, axe-core, Vitest. MIT license.

### Roadmap for version 1

1. ~~Project skeleton~~
2. ~~Single-page scan and a readable report~~
3. ~~Crawling multiple pages~~
4. ~~Plain-English explanations for the most common problems~~
5. ~~Tests and a GitHub Action~~

## Development

Requires Node.js 22.12 or newer.

```bash
npm install
npx playwright install chromium --only-shell
npm run build
node dist/cli.js scan https://example.com
```

`scan` accepts a full address, a bare domain (`example.com`), or a local HTML file.
It checks that page, then follows links to other pages on the same site, up to
25 pages. Use `--max-pages <n>` to change the limit (`--max-pages 1` checks one page).
It stays inside the folder you start in: starting at `example.com/blog/` only checks
pages under `/blog/`, while starting at the home page checks the whole site. It skips
links to other sites, emails, and files such as PDFs and images.

It writes `open-a11y-report/report.html` (open it in any browser) and
`open-a11y-report/results.json`, plus a short `summary.md`. Use `--out <folder>` to write
somewhere else.
The report groups each kind of problem across pages, lists every page checked,
and lists any links that could not be opened.

For the most common problems (37 of the 70 WCAG rules axe-core checks), the report
explains in plain English what's wrong, who it affects, and how to fix it, with a
before-and-after code example. These live in `src/explanations.ts`. Other rules show
axe-core's own wording plus a link to Deque University. Adding more explanations is
an easy way to contribute.

Exit codes: `0` no problems found, `1` problems found, `2` could not scan.

Sample pages with deliberate mistakes, for trying the scanner out:
- `test/fixtures/sample-broken.html`: one page.
- `test/fixtures/site/index.html`: a three-page site with a broken link and links
  the crawler should skip.

## Accessibility statement and footer links

```bash
node dist/cli.js statement
```

The first time, it asks a few questions: your organization's name, website, a contact
email, how many working days you take to reply, and optionally a phone number and a
report-a-problem page. The answers are saved in `open-a11y.config.json`, so it only asks
once. It writes four files to `open-a11y-statement/<website>/`:

- `statement.html`: the statement as a web page, ready to upload.
- `statement.md`: the same text, to paste into a website builder.
- `footer.html`: two plain links for your footer, "Accessibility statement" and
  "Report an accessibility problem" (email for now; your portal's form once you have one).
- `instructions.md`: how to add them in WordPress, Squarespace, Wix or Shopify.

The statement follows the structure W3C recommends. If `open-a11y-report/results.json`
holds a scan of the same website, its problems are listed in plain English under
"Problems we know about". The statement always says the site **partially conforms**:
automated checks can't prove full conformance, so the tool never claims it.

More than one website: `--new` sets up another, `--site <name>` picks one, and `--edit`
changes the saved answers.

## Accessibility report portal (free, self-hosted)

Give visitors an easy way to report accessibility problems, get emailed when they do,
keep a dated record of every report and fix, and host an honest accessibility statement.
Each owner runs their own copy on Cloudflare's free plan.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/openaccessibilitytoolkit/open-accessibility-toolkit/tree/main/portal)

No coding needed: follow the **[step-by-step setup guide](docs/setup-guide.md)**. See the
[live demo](https://open-a11y-portal.openaccessibilitytoolkit.workers.dev/report/joesbakery-example)
and [portal/README.md](portal/README.md) for details.

## What's next (planned)

1. Progress history: what got fixed and what's new since the last scan.
2. A free, self-hosted portal on Cloudflare (in `portal/`; [live demo](https://open-a11y-portal.openaccessibilitytoolkit.workers.dev/report/joesbakery-example): report form, emails, login, inbox, websites, statement and footer links): a report-a-problem form with an automatic
   reply, an email to the owner, and an inbox of reports with dates and status.
3. A step-by-step setup guide for people who don't code.

## Tests

```bash
npm test
```

This builds the project, then runs:
- quick tests of the building blocks: link following, report wording, HTML safety,
  and the explanations;
- end-to-end tests that open the sample pages in the hidden browser, check that every
  planted mistake is found, and check that the report passes its own accessibility scan.

GitHub runs the same tests on every change (`.github/workflows/ci.yml`) on Linux and
Windows, and tries the GitHub Action on the sample site.

## Use it on GitHub (free)

Add this file to your website's repository as `.github/workflows/accessibility.yml`.
It scans your site every Monday, and whenever you press "Run workflow" on the Actions tab:

```yaml
name: Accessibility scan
on:
  schedule:
    - cron: "0 6 * * 1"
  workflow_dispatch:

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: openaccessibilitytoolkit/open-accessibility-toolkit@v1
        with:
          url: https://www.example.com
          max-pages: 25
```

Each run shows a summary table on its page, with the full report attached to download.

Options:
- `url` (required): the address to start from, or an HTML file in your repository.
- `max-pages`: the most pages to check (default `25`).
- `fail-on-problems`: set to `"true"` to mark the run as failed when problems are found,
  so new problems can't slip in unnoticed (default `"false"`).
- `report-name`: name of the attached report (default `accessibility-report`).

Outputs: `problems`, `elements` and `pages`, for use in later steps.

The action sets up Node.js 24 for the rest of the job.

## License and disclaimer

Free and open source under the [MIT License](LICENSE). Use at your own risk: see the
[disclaimer](DISCLAIMER.md). To report a security problem, see [SECURITY.md](SECURITY.md).
