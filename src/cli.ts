#!/usr/bin/env node
// Entry point for the `open-a11y` command.

import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { scanSite, type SiteScanResult } from "./scan.js";
import { groupByRule, renderHtmlReport, summarize } from "./report.js";
import { renderMarkdownSummary } from "./summary.js";
import { explain } from "./explanations.js";
import { toScanUrl } from "./url.js";
import {
  CONFIG_FILE,
  Prompter,
  askSiteSettings,
  loadConfig,
  saveConfig,
  type Config,
  type SiteSettings,
} from "./settings.js";
import {
  renderFooterHtml,
  renderInstructions,
  renderStatementHtml,
  renderStatementMarkdown,
  scanFacts,
  scanMatchesSite,
  type ScanFacts,
} from "./statement.js";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

const DEFAULT_MAX_PAGES = 25;

const HELP = `open-a11y ${pkg.version}

Helps you find and fix website accessibility issues against WCAG 2.2 AA.
Automated checks catch only part of WCAG; people still need to verify the rest.

Usage:
  open-a11y scan <url-or-file>   Scan a site, following its links, and write a report
  open-a11y statement            Write an accessibility statement and footer links
  open-a11y --help               Show this help
  open-a11y --version            Show the version

Scan options:
  -n, --max-pages <number>   Most pages to check (default: ${DEFAULT_MAX_PAGES}; use 1 for one page)
  -o, --out <folder>         Where to write the report (default: open-a11y-report)

Statement options:
  --new                      Set up another website
  --site <name>              Which website, when you have more than one
  --edit                     Change the answers you gave before
  --from <folder>            Where your latest scan is (default: open-a11y-report)
  -o, --out <folder>         Where to write the statement (default: open-a11y-statement)

The statement questions are asked once and saved in ${CONFIG_FILE}.

Exit codes for scan: 0 no problems found, 1 problems found, 2 could not scan.
`;

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

function parseMaxPages(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    fail(`--max-pages must be a whole number of 1 or more, not "${value}".`);
  }
  return n;
}

async function runScan(target: string, outDir: string, maxPages: number): Promise<void> {
  let url: string;
  try {
    url = toScanUrl(target);
  } catch {
    fail(`"${target}" is not a web address or a file on this computer.`);
  }

  console.log(`Scanning ${url} (up to ${maxPages} page${maxPages === 1 ? "" : "s"}) ...`);
  let result: SiteScanResult;
  try {
    let count = 0;
    result = await scanSite(url, {
      maxPages,
      onProgress: (event) => {
        if ("error" in event) {
          console.log(`  could not open ${event.url}: ${event.error}`);
        } else {
          count++;
          const n = event.result.axe.violations.length;
          console.log(`  [${count}/${maxPages}] ${event.url}: ${n} kind(s) of problem`);
        }
      },
    });
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

  if (result.pages.length === 0) {
    fail(`Could not open any pages starting from ${url}.`);
  }

  await mkdir(outDir, { recursive: true });
  const htmlPath = path.resolve(outDir, "report.html");
  const jsonPath = path.resolve(outDir, "results.json");
  await writeFile(htmlPath, renderHtmlReport(result), "utf8");
  const s = summarize(result);
  await writeFile(jsonPath, JSON.stringify({ summary: s, ...result }, null, 2), "utf8");
  // A short Markdown version, shown on the GitHub Actions run page.
  await writeFile(path.resolve(outDir, "summary.md"), renderMarkdownSummary(result), "utf8");

  const impacts = Object.entries(s.byImpact)
    .filter(([, n]) => n > 0)
    .map(([impact, n]) => `${n} ${impact}`)
    .join(", ");
  console.log(
    `\nChecked ${s.pagesScanned} page(s). Found ${s.problems} kind(s) of problem` +
      (impacts ? ` (${impacts})` : "") +
      ` on ${s.pagesWithProblems} page(s), affecting ${s.elements} element(s).` +
      `\n${s.needsReview} check(s) need a person to decide.` +
      (s.pagesFailed ? `\n${s.pagesFailed} page(s) could not be opened.` : "") +
      (result.hitLimit
        ? `\nStopped at the ${maxPages}-page limit; use --max-pages to check more.`
        : ""),
  );
  const problems = groupByRule(result.pages, (p) => p.axe.violations);
  if (problems.length > 0) {
    console.log("\nProblems, most serious first:");
    for (const g of problems) {
      const title = explain(g.rule.id)?.title ?? g.rule.help;
      console.log(
        `  [${g.impact ?? "minor"}] ${title} (${g.elements} element(s) on ${g.pages.length} page(s))`,
      );
    }
  }
  console.log(`\nReport: ${htmlPath}\nData:   ${jsonPath}`);
  process.exitCode = s.problems > 0 ? 1 : 0;
}

async function chooseSite(
  config: Config,
  wanted: string | undefined,
  prompter: Prompter,
): Promise<SiteSettings> {
  if (wanted) {
    const site = config.sites.find((s) => s.id === wanted);
    if (!site) {
      fail(`No website called "${wanted}" is set up. Set up websites: ${config.sites.map((s) => s.id).join(", ")}`);
    }
    return site;
  }
  if (config.sites.length === 1) return config.sites[0];
  console.log("Which website?");
  config.sites.forEach((s, i) => console.log(`  ${i + 1}. ${s.organization} (${s.website})`));
  const count = config.sites.length;
  const choice = await prompter.ask(`Type a number from 1 to ${count}:`, (answer) => {
    const n = Number(answer);
    return Number.isInteger(n) && n >= 1 && n <= count
      ? { ok: true as const, value: n }
      : { ok: false as const, message: `Please type a number from 1 to ${count}.` };
  });
  return config.sites[choice - 1];
}

async function latestScanFacts(fromDir: string, site: SiteSettings): Promise<ScanFacts | undefined> {
  const file = path.resolve(fromDir, "results.json");
  if (!existsSync(file)) {
    console.log(
      `\nNo scan found in ${fromDir}, so the statement has no list of known problems yet.` +
        `\nTip: run "open-a11y scan ${site.website}" first, then run this again.`,
    );
    return undefined;
  }
  const scan = JSON.parse(await readFile(file, "utf8")) as SiteScanResult;
  if (!scanMatchesSite(scan, site)) {
    console.log(`\nThe scan in ${fromDir} is of ${scan.startUrl}, not ${site.website}, so it was not used.`);
    return undefined;
  }
  return scanFacts(scan);
}

async function runStatement(opts: {
  site?: string;
  isNew: boolean;
  edit: boolean;
  from: string;
  out: string;
}): Promise<void> {
  const config = await loadConfig();
  const prompter = new Prompter();
  let site: SiteSettings;
  try {
    if (opts.isNew || config.sites.length === 0) {
      console.log(
        config.sites.length === 0
          ? "Let's set up your accessibility statement. Your answers are saved, so you only do this once.\n"
          : "Setting up another website.\n",
      );
      site = await askSiteSettings(prompter);
      const id = site.id;
      if (config.sites.some((s) => s.id === id)) {
        fail(`${site.website} is already set up. To change its answers, run: open-a11y statement --site ${id} --edit`);
      }
      config.sites.push(site);
      await saveConfig(config);
    } else {
      site = await chooseSite(config, opts.site, prompter);
      if (opts.edit) {
        console.log("Press Enter to keep an answer as it is.\n");
        const updated = await askSiteSettings(prompter, site);
        const others = config.sites.filter((s) => s !== site);
        if (others.some((s) => s.id === updated.id)) {
          fail(`${updated.website} is already set up as a separate website.`);
        }
        config.sites[config.sites.indexOf(site)] = updated;
        site = updated;
        await saveConfig(config);
      }
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  } finally {
    prompter.close();
  }

  const facts = await latestScanFacts(opts.from, site);
  const outDir = path.resolve(opts.out, site.id);
  await mkdir(outDir, { recursive: true });
  const files: Record<string, string> = {
    "statement.html": renderStatementHtml(site, facts),
    "statement.md": renderStatementMarkdown(site, facts),
    "footer.html": renderFooterHtml(site),
    "instructions.md": renderInstructions(site),
  };
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(outDir, name), content, "utf8");
  }
  console.log(
    `\nAccessibility statement for ${site.organization} is ready in ${outDir}` +
      "\n  statement.html    the statement as a web page" +
      "\n  statement.md      the same text, to paste into your website builder" +
      "\n  footer.html       the two footer links" +
      "\n  instructions.md   how to add them to WordPress, Squarespace, Wix or Shopify" +
      `\n\nPublish the statement at ${site.statementUrl} so the footer link works.`,
  );
}

async function main(): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
        out: { type: "string", short: "o" },
        new: { type: "boolean" },
        edit: { type: "boolean" },
        site: { type: "string" },
        from: { type: "string", default: "open-a11y-report" },
        "max-pages": { type: "string", short: "n", default: String(DEFAULT_MAX_PAGES) },
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
    await runScan(target, values.out ?? "open-a11y-report", parseMaxPages(values["max-pages"]));
  } else if (command === "statement" && !values.help) {
    await runStatement({
      site: values.site,
      isNew: values.new ?? false,
      edit: values.edit ?? false,
      from: values.from,
      out: values.out ?? "open-a11y-statement",
    });
  } else {
    console.log(HELP);
  }
}

await main();
