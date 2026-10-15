# Open Accessibility Toolkit (working name)

Free, open-source toolkit that helps website owners **find and fix** accessibility
problems against **WCAG 2.2 AA**, the standard used for ADA (US) and EAA (EU) web
accessibility.

> Automated checks catch only part of WCAG. This toolkit does not make a site
> "compliant" on its own; people still need to verify the rest.

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
3. Crawling multiple pages
4. Plain-English explanations for the most common problems
5. Tests and a GitHub Action

## Development

Requires Node.js 20 or newer.

```bash
npm install
npx playwright install chromium --only-shell
npm run build
node dist/cli.js scan https://example.com
```

`scan` accepts a full address, a bare domain (`example.com`), or a local HTML file.
It writes `open-a11y-report/report.html` (open it in any browser) and
`open-a11y-report/results.json`. Use `--out <folder>` to write somewhere else.

Exit codes: `0` no problems found, `1` problems found, `2` could not scan.

`test/fixtures/sample-broken.html` is a page with deliberate mistakes for trying
the scanner out.
