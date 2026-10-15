#!/usr/bin/env node
// Entry point for the `open-a11y` command.

import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { scanPage } from "./scan.js";
import { renderHtmlReport, summarize } from "./report.js";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

const HELP = `open-a11y ${pkg.version}

Helps you find and fix website accessibility issues against WCAG 2.2 AA.
Automated checks catch only part of WCAG; people still need to verify the rest.

Usage:
  open-a11y scan <url-or-file>   Scan one page and write a report
  open-a11y --help               Show this help
  open-a11y --version            Show the version

Options:
  -o, --out <folder>   Where to write the report (default: open-a11y-report)

Exit codes: 0 no problems found, 1 problems found, 2 could not scan.
`;

/** Accepts a full address, a bare domain like example.com, or a local HTML file. */
export function toScanUrl(input: string): string {
  if (/^(https?|file):/i.test(input)) return new URL(input).href;
  if (existsSync(input)) return pathToFileURL(path.resolve(input)).href;
  return new URL(`https://${input}`).href;
}

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

async function runScan(target: string, outDir: string): Promise<void> {
  let url: string;
  try {
    url = toScanUrl(target);
  } catch {
    fail(`"${target}" is not a web address or a file on this computer.`);
  }

  console.log(`Scanning ${url} ...`);
  let result;
  try {
    result = await scanPage(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/Executable doesn't exist/i.test(message)) {
      fail(
        "The hidden browser is not installed yet. Run this once, then try again:\n" +
          "  npx playwright install chromium --only-shell",
      );
    }
    fail(`Could not scan ${url}:\n  ${message.split("\n")[0]}`);
  }

  await mkdir(outDir, { recursive: true });
  const htmlPath = path.resolve(outDir, "report.html");
  const jsonPath = path.resolve(outDir, "results.json");
  await writeFile(htmlPath, renderHtmlReport(result), "utf8");
  await writeFile(jsonPath, JSON.stringify(result, null, 2), "utf8");

  const s = summarize(result);
  const impacts = Object.entries(s.byImpact)
    .filter(([, n]) => n > 0)
    .map(([impact, n]) => `${n} ${impact}`)
    .join(", ");
  console.log(
    `\nFound ${s.problems} problem(s) affecting ${s.elements} element(s)` +
      (impacts ? ` (${impacts})` : "") +
      `.\n${s.needsReview} check(s) need a person to decide. ${s.passed} check(s) passed.` +
      `\n\nReport: ${htmlPath}\nData:   ${jsonPath}`,
  );
  process.exitCode = s.problems > 0 ? 1 : 0;
}

async function main(): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
        out: { type: "string", short: "o", default: "open-a11y-report" },
      },
    });
  } catch (err) {
    fail(`${err instanceof Error ? err.message : err}\n\n${HELP}`);
  }
  const { values, positionals } = parsed;
  const [command, target] = positionals;

  if (values.version) {
    console.log(pkg.version);
  } else if (command === "scan" && !values.help) {
    if (!target) fail(`Please give a web address to scan.\n\n${HELP}`);
    await runScan(target, values.out);
  } else {
    console.log(HELP);
  }
}

await main();
