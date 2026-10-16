# Changelog

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
