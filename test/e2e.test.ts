// End-to-end tests: real hidden browser, real axe-core, real sample pages.
// These need the browser installed: npx playwright install chromium --only-shell

import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { renderHtmlReport } from "../src/report.js";
import { scanSite } from "../src/scan.js";
import { fakeNode, fakePage, fakeRule, fakeScan } from "./helpers.js";

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

/** Runs the command in a folder, typing the given answers. */
function runCli(args: string[], cwd: string, answers: string[] = []) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn("node", [path.join(root, "dist", "cli.js"), ...args], { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(answers.map((a) => `${a}\n`).join(""));
  });
}

describe("open-a11y statement", () => {
  const bakery = ["Joe's Bakery", "joesbakery.com", "hello@joesbakery.com", "5", "", "", ""];

  it("asks once, saves the answers, and writes all four files", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "open-a11y-statement-"));
    const first = await runCli(["statement"], dir, bakery);
    expect(first.code).toBe(0);
    expect(first.stdout).toContain("No scan found");
    const out = path.join(dir, "open-a11y-statement", "joesbakery-com");
    for (const file of ["statement.html", "statement.md", "footer.html", "instructions.md"]) {
      expect(existsSync(path.join(out, file))).toBe(true);
    }
    const config = JSON.parse(await readFile(path.join(dir, "open-a11y.config.json"), "utf8"));
    expect(config.sites.map((s: { id: string }) => s.id)).toEqual(["joesbakery-com"]);

    // The second time, no questions are asked.
    const second = await runCli(["statement"], dir);
    expect(second.code).toBe(0);
    expect(second.stdout).not.toContain("Organization name?");
  });

  it("uses the latest scan of the same website for known problems", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "open-a11y-statement-"));
    const scan = fakeScan([
      fakePage("https://joesbakery.com/", [fakeRule("image-alt", "critical", [fakeNode("<img>")])]),
    ]);
    await mkdir(path.join(dir, "open-a11y-report"));
    await writeFile(path.join(dir, "open-a11y-report", "results.json"), JSON.stringify(scan));
    expect((await runCli(["statement"], dir, bakery)).code).toBe(0);
    const md = await readFile(path.join(dir, "open-a11y-statement", "joesbakery-com", "statement.md"), "utf8");
    expect(md).toContain("- Images need a text description (1 page)");
  });

  it("manages more than one website", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "open-a11y-statement-"));
    await runCli(["statement"], dir, bakery);
    const added = await runCli(["statement", "--new"], dir, [
      "Joe's Cafe", "joescafe.com", "cafe@joescafe.com", "3", "", "", "",
    ]);
    expect(added.code).toBe(0);
    const again = await runCli(["statement", "--new"], dir, bakery);
    expect(again.code).toBe(2);
    expect(again.stderr).toContain("already set up");
    const chosen = await runCli(["statement"], dir, ["2"]);
    expect(chosen.stdout).toContain("Accessibility statement for Joe's Cafe is ready");
    const named = await runCli(["statement", "--site", "joesbakery-com"], dir);
    expect(named.stdout).toContain("Accessibility statement for Joe's Bakery is ready");
  });

  it("writes a statement page that passes its own accessibility scan", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "open-a11y-statement-"));
    await runCli(["statement"], dir, [...bakery.slice(0, 4), "555-0100", "", "https://help.joesbakery.com/report"]);
    const page = path.join(dir, "open-a11y-statement", "joesbakery-com", "statement.html");
    const self = await scanSite(pathToFileURL(page).href, { maxPages: 1 });
    expect(self.pages[0].axe.violations).toEqual([]);
  });
});
