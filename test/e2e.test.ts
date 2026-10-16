// End-to-end tests: real hidden browser, real axe-core, real sample pages.
// These need the browser installed: npx playwright install chromium --only-shell

import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { renderHtmlReport } from "../src/report.js";
import { scanSite } from "../src/scan.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (...parts: string[]) => pathToFileURL(path.join(root, "test", "fixtures", ...parts)).href;
const run = promisify(execFile);

describe("scanSite", () => {
  it("finds every mistake planted in the sample page", async () => {
    const result = await scanSite(fixture("sample-broken.html"), { maxPages: 1 });
    const found = result.pages[0].axe.violations.map((v) => v.id).sort();
    expect(found).toEqual([
      "button-name",
      "color-contrast",
      "html-has-lang",
      "image-alt",
      "label",
      "link-name",
    ]);
  });

  it("crawls the sample site, records broken links and skips what it should", async () => {
    const result = await scanSite(fixture("site", "index.html"), { maxPages: 25 });
    expect(result.pages.map((p) => path.basename(p.url))).toEqual([
      "index.html",
      "about.html",
      "contact.html",
    ]);
    expect(result.errors.map((e) => path.basename(e.url))).toEqual(["missing.html"]);
    expect(result.hitLimit).toBe(false);
    // The logo with no alt text is in the shared header on every page.
    for (const page of result.pages) {
      expect(page.axe.violations.map((v) => v.id)).toContain("image-alt");
    }
  });

  it("stops at the page limit and says so", async () => {
    const result = await scanSite(fixture("site", "index.html"), { maxPages: 2 });
    expect(result.pages).toHaveLength(2);
    expect(result.hitLimit).toBe(true);
  });

  it("produces a report that passes its own accessibility check", async () => {
    const scan = await scanSite(fixture("site", "index.html"), { maxPages: 25 });
    const dir = await mkdtemp(path.join(os.tmpdir(), "open-a11y-test-"));
    const reportFile = path.join(dir, "report.html");
    await writeFile(reportFile, renderHtmlReport(scan), "utf8");
    const self = await scanSite(pathToFileURL(reportFile).href, { maxPages: 1 });
    expect(self.pages[0].axe.violations).toEqual([]);
  });
});

describe("open-a11y command", () => {
  const cli = path.join(root, "dist", "cli.js");

  it("exits with 1 and writes all three files when it finds problems", async () => {
    const out = await mkdtemp(path.join(os.tmpdir(), "open-a11y-cli-"));
    const err = await run("node", [cli, "scan", fixture("sample-broken.html"), "-n", "1", "-o", out]).catch(
      (e) => e,
    );
    expect(err.code).toBe(1);
    expect(err.stdout).toContain("Images need a text description");
    const summary = await readFile(path.join(out, "summary.md"), "utf8");
    expect(summary).toContain("## Accessibility scan");
    expect(await readFile(path.join(out, "report.html"), "utf8")).toContain("<html lang=\"en\">");
    expect(JSON.parse(await readFile(path.join(out, "results.json"), "utf8")).pages).toHaveLength(1);
  });

  it("exits with 2 and a clear message for a bad page limit", async () => {
    const err = await run("node", [cli, "scan", "example.com", "-n", "0"]).catch((e) => e);
    expect(err.code).toBe(2);
    expect(err.stderr).toContain("--max-pages must be a whole number");
  });
});
