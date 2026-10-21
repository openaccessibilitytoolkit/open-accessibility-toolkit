// "Check my website": an automated check of a website's pages for common WCAG 2.2
// problems, with the same checker (axe-core) as the command-line tool.
//
// A check runs one page at a time. Each step is a short request that checks the next
// page, saves what it found, and adds that page's links to the list, so no request runs
// for long and a check can carry on if a step fails. Only websites added to the portal
// can be checked, and the check only follows links on that same website.

export const SCAN_MAX_PAGES = 10;
/** How many earlier checks each website keeps. */
export const SCANS_KEPT = 20;
/** Most pages ever added to the list, so a huge website can't make the list endless. */
const MAX_SEEN = 200;
/** A step that hasn't finished after this long is assumed lost, and the page can be tried again. */
const STEP_LOCK_MS = 90_000;

/** axe-core rule tags that make up WCAG 2.2 Level A and AA (as in the command-line tool). */
export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export type Impact = "critical" | "serious" | "moderate" | "minor";
export const IMPACT_ORDER: Impact[] = ["critical", "serious", "moderate", "minor"];

/** One kind of problem on one page, kept small enough to store. */
export interface FoundProblem {
  id: string;
  impact: Impact | null;
  /** axe-core's own short description, used when we have no plain-English one. */
  help: string;
  helpUrl: string;
  tags: string[];
  /** How many elements on the page have this problem. */
  count: number;
  /** A few of those elements, to help find them. */
  examples: { target: string; html: string; detail?: string }[];
}

export interface PageFindings {
  problems: FoundProblem[];
  /** Rules axe couldn't decide on: a person needs to check these. */
  needsReview: string[];
}

/** What checking one page gave. "skip" means it wasn't a web page (a PDF, say) or was a repeat. */
export type CheckOutcome =
  | { kind: "page"; url: string; title: string; links: string[]; findings: PageFindings }
  | { kind: "skip"; url: string }
  | { kind: "error"; url: string; reason: string };

/** Something that can open pages and check them: Cloudflare's browser, or a pretend one in tests. */
export interface PageChecker {
  check(url: string, site: URL): Promise<CheckOutcome>;
  /** Called when the whole check has finished, to free the browser. */
  finish(): Promise<void>;
  /** Called between steps, to keep the browser for the next page. */
  pause(): Promise<void>;
  /** The browser session to reuse in the next step, if any. */
  sessionId?: string;
}

/** Thrown by a PageChecker when Cloudflare's browser can't be used right now. */
export class BrowserUnavailable extends Error {
  constructor(
    message: string,
    /** True when the free daily allowance is used up; false when it's only busy for a moment. */
    readonly dailyLimit: boolean,
    /** How long to wait before trying again, when it's only busy. */
    readonly waitMs = 20_000,
  ) {
    super(message);
  }
}

export interface Scan {
  id: number;
  site_id: string;
  started_at: string;
  started_by: string;
  finished_at: string | null;
  status: "running" | "done" | "stopped";
  max_pages: number;
  queue: string;
  seen: string;
  browser_session: string | null;
  busy_until: number | null;
  note: string | null;
}

export interface ScanPage {
  position: number;
  url: string;
  title: string | null;
  error: string | null;
  findings: PageFindings | null;
  checked_at: string;
}

const SCAN_COLUMNS =
  "id, site_id, started_at, started_by, finished_at, status, max_pages, queue, seen, browser_session, busy_until, note";

function siteHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

/** Pages a browser shouldn't open as web pages. */
const SKIP_EXTENSIONS =
  /\.(pdf|jpe?g|png|gif|svg|webp|avif|ico|bmp|zip|gz|rar|7z|mp3|mp4|mov|webm|wav|docx?|xlsx?|pptx?|csv|txt|xml|json|js|css|woff2?|ttf|eot|exe|dmg|msi)$/i;

/**
 * Returns the link as a clean address if it's another page on the same website (inside
 * the folder the check started in), or null if the check shouldn't follow it. Treats
 * example.com and www.example.com as the same website, like the command-line tool.
 */
export function sameSiteUrl(href: string, site: URL): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (siteHost(url.host) !== siteHost(site.host)) return null;
  const folder = site.pathname.slice(0, site.pathname.lastIndexOf("/") + 1);
  if (!url.pathname.startsWith(folder)) return null;
  if (SKIP_EXTENSIONS.test(url.pathname)) return null;
  url.hash = "";
  return url.href;
}

function parseList(json: string): string[] {
  try {
    const list = JSON.parse(json) as unknown;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function parseFindings(json: string | null): PageFindings | null {
  if (!json) return null;
  try {
    const f = JSON.parse(json) as PageFindings;
    return Array.isArray(f.problems) && Array.isArray(f.needsReview) ? f : null;
  } catch {
    return null;
  }
}

// ---- Storage ----

export function getScan(db: D1Database, siteId: string, scanId: number): Promise<Scan | null> {
  return db.prepare(`SELECT ${SCAN_COLUMNS} FROM scans WHERE id = ? AND site_id = ?`).bind(scanId, siteId).first<Scan>();
}

export async function listScans(db: D1Database, siteId: string, limit = SCANS_KEPT): Promise<(Scan & { pages: number; problems: number })[]> {
  const { results } = await db
    .prepare(`SELECT ${SCAN_COLUMNS} FROM scans WHERE site_id = ? ORDER BY started_at DESC, id DESC LIMIT ?`)
    .bind(siteId, limit)
    .all<Scan>();
  return Promise.all(
    results.map(async (scan) => {
      const pages = await listScanPages(db, scan.id);
      return { ...scan, pages: pages.filter((p) => p.findings).length, problems: groupProblems(pages).length };
    }),
  );
}

export async function listScanPages(db: D1Database, scanId: number): Promise<ScanPage[]> {
  const { results } = await db
    .prepare("SELECT position, url, title, error, results, checked_at FROM scan_pages WHERE scan_id = ? ORDER BY position")
    .bind(scanId)
    .all<{ position: number; url: string; title: string | null; error: string | null; results: string | null; checked_at: string }>();
  return results.map((r) => ({ position: r.position, url: r.url, title: r.title, error: r.error, findings: parseFindings(r.results), checked_at: r.checked_at }));
}

/** The check that's still going for this website, if there is one. */
export function runningScan(db: D1Database, siteId: string): Promise<Scan | null> {
  return db
    .prepare(`SELECT ${SCAN_COLUMNS} FROM scans WHERE site_id = ? AND status = 'running' ORDER BY id DESC LIMIT 1`)
    .bind(siteId)
    .first<Scan>();
}

/** Starts a check of a website from its home page, and forgets the oldest checks beyond SCANS_KEPT. */
export async function startScan(db: D1Database, siteId: string, website: string, email: string, now: Date): Promise<number> {
  const start = sameSiteUrl(website, new URL(website)) ?? website;
  const row = await db
    .prepare(
      `INSERT INTO scans (site_id, started_at, started_by, status, max_pages, queue, seen)
       VALUES (?, ?, ?, 'running', ?, ?, ?) RETURNING id`,
    )
    .bind(siteId, now.toISOString(), email, SCAN_MAX_PAGES, JSON.stringify([start]), JSON.stringify([start]))
    .first<{ id: number }>();
  const old = `SELECT id FROM scans WHERE site_id = ? ORDER BY started_at DESC, id DESC LIMIT -1 OFFSET ${SCANS_KEPT}`;
  await db.batch([
    db.prepare(`DELETE FROM scan_pages WHERE scan_id IN (${old})`).bind(siteId),
    db.prepare(`DELETE FROM scans WHERE id IN (${old})`).bind(siteId),
  ]);
  return row!.id;
}

async function finishScan(db: D1Database, scanId: number, status: "done" | "stopped", now: Date, note: string | null) {
  await db
    .prepare("UPDATE scans SET status = ?, finished_at = ?, note = ?, queue = '[]', busy_until = NULL, browser_session = NULL WHERE id = ?")
    .bind(status, now.toISOString(), note, scanId)
    .run();
}

/** Stops a check by hand. Pages already checked are kept. */
export async function stopScan(db: D1Database, scanId: number, now: Date): Promise<void> {
  await db
    .prepare("UPDATE scans SET status = 'stopped', finished_at = ?, note = ?, queue = '[]', busy_until = NULL WHERE id = ? AND status = 'running'")
    .bind(now.toISOString(), "You stopped this check.", scanId)
    .run();
}

// ---- One step ----

export type StepResult =
  | { state: "running"; checked: number; maxPages: number; waitMs?: number; message: string }
  | { state: "finished"; checked: number; message: string };

const DAILY_LIMIT_NOTE =
  "Cloudflare's free allowance for checking pages is used up for today. It resets at midnight UTC (8pm US Eastern). The pages already checked are below.";

/**
 * Checks the next page of a running check. Safe to call twice at once: the second call
 * sees the first is busy and just reports progress.
 */
export async function runScanStep(
  db: D1Database,
  given: Scan,
  openChecker: (sessionId: string | null) => Promise<PageChecker>,
  now: Date,
): Promise<StepResult> {
  let scan = given;
  const pagesSoFar = async () =>
    (await db.prepare("SELECT COUNT(*) AS n FROM scan_pages WHERE scan_id = ? AND error IS NULL").bind(scan.id).first<{ n: number }>())?.n ?? 0;
  if (scan.status !== "running") {
    return { state: "finished", checked: await pagesSoFar(), message: "This check has finished." };
  }

  // Take the step, unless another one is already under way.
  const lock = await db
    .prepare("UPDATE scans SET busy_until = ? WHERE id = ? AND status = 'running' AND (busy_until IS NULL OR busy_until < ?)")
    .bind(now.getTime() + STEP_LOCK_MS, scan.id, now.getTime())
    .run();
  if (lock.meta.changes === 0) {
    const checked = await pagesSoFar();
    return { state: "running", checked, maxPages: scan.max_pages, waitMs: 3000, message: progressMessage(checked, scan.max_pages) };
  }

  // Read it again now it's ours: an earlier step may have just finished.
  scan = (await getScan(db, scan.site_id, scan.id)) ?? scan;
  const queue = parseList(scan.queue);
  const seen = parseList(scan.seen);
  let checked = await pagesSoFar();
  const nextPosition =
    ((await db.prepare("SELECT MAX(position) AS p FROM scan_pages WHERE scan_id = ?").bind(scan.id).first<{ p: number | null }>())?.p ?? -1) + 1;

  if (queue.length === 0 || checked >= scan.max_pages) {
    await finishScan(db, scan.id, "done", now, null);
    await closeQuietly(openChecker, scan.browser_session);
    return { state: "finished", checked, message: finishedMessage(checked) };
  }

  let checker: PageChecker;
  try {
    checker = await openChecker(scan.browser_session);
  } catch (e) {
    if (e instanceof BrowserUnavailable && !e.dailyLimit) {
      await db.prepare("UPDATE scans SET busy_until = NULL, browser_session = NULL WHERE id = ?").bind(scan.id).run();
      return { state: "running", checked, maxPages: scan.max_pages, waitMs: e.waitMs, message: e.message };
    }
    if (!(e instanceof BrowserUnavailable)) console.error("Check my website: couldn't open the browser:", e);
    const note =
      e instanceof BrowserUnavailable
        ? DAILY_LIMIT_NOTE
        : `We couldn't start the browser that checks your pages, so the check stopped. Please try again in a few minutes. (${shortReason(e)})`;
    await finishScan(db, scan.id, "stopped", now, note);
    return { state: "finished", checked, message: note };
  }

  const url = queue.shift()!;
  // The website's address as the check started, so links are judged against it.
  const site = new URL(seen[0] ?? url);
  let outcome: CheckOutcome;
  try {
    outcome = await checker.check(url, site);
  } catch (e) {
    if (e instanceof BrowserUnavailable && e.dailyLimit) {
      await finishScan(db, scan.id, "stopped", now, DAILY_LIMIT_NOTE);
      await checker.finish().catch(() => {});
      return { state: "finished", checked, message: DAILY_LIMIT_NOTE };
    }
    outcome = { kind: "error", url, reason: shortReason(e) };
  }

  const at = now.toISOString();
  const writes: D1PreparedStatement[] = [];
  if (outcome.kind === "page") {
    // Repeats (two addresses for the same page, after redirects) are checked once.
    const repeat = await db.prepare("SELECT 1 FROM scan_pages WHERE scan_id = ? AND url = ? AND error IS NULL").bind(scan.id, outcome.url).first();
    if (!repeat) {
      writes.push(
        db
          .prepare("INSERT INTO scan_pages (scan_id, position, url, title, results, checked_at) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(scan.id, nextPosition, outcome.url, outcome.title.slice(0, 300), JSON.stringify(outcome.findings), at),
      );
      checked++;
      for (const link of outcome.links) {
        const next = sameSiteUrl(link, site);
        if (next && !seen.includes(next) && seen.length < MAX_SEEN) {
          seen.push(next);
          queue.push(next);
        }
      }
    }
  } else if (outcome.kind === "error") {
    writes.push(
      db
        .prepare("INSERT INTO scan_pages (scan_id, position, url, error, checked_at) VALUES (?, ?, ?, ?, ?)")
        .bind(scan.id, nextPosition, outcome.url, outcome.reason.slice(0, 300), at),
    );
  }

  const done = queue.length === 0 || checked >= scan.max_pages;
  writes.push(
    done
      ? db
          .prepare("UPDATE scans SET status = 'done', finished_at = ?, queue = '[]', seen = ?, busy_until = NULL, browser_session = NULL WHERE id = ?")
          .bind(at, JSON.stringify(seen), scan.id)
      : db
          .prepare("UPDATE scans SET queue = ?, seen = ?, busy_until = NULL, browser_session = ? WHERE id = ?")
          .bind(JSON.stringify(queue), JSON.stringify(seen), checker.sessionId ?? null, scan.id),
  );
  await db.batch(writes);
  if (done) {
    await checker.finish().catch(() => {});
    return { state: "finished", checked, message: finishedMessage(checked) };
  }
  await checker.pause().catch(() => {});
  return { state: "running", checked, maxPages: scan.max_pages, message: progressMessage(checked, scan.max_pages) };
}

async function closeQuietly(openChecker: (sessionId: string | null) => Promise<PageChecker>, sessionId: string | null) {
  if (!sessionId) return;
  try {
    await (await openChecker(sessionId)).finish();
  } catch {
    // The browser closes by itself after a minute anyway.
  }
}

/** The first line of an error, kept short: enough to search for, without a wall of technical detail. */
function shortReason(e: unknown): string {
  const line = (e instanceof Error ? e.message : String(e)).split("\n")[0].trim();
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}

function progressMessage(checked: number, maxPages: number): string {
  return `Checked ${checked} of up to ${maxPages} pages. Checking the next page...`;
}

function finishedMessage(checked: number): string {
  return `Finished: checked ${checked} page${checked === 1 ? "" : "s"}.`;
}

// ---- Putting the results together ----

export function impactRank(impact: Impact | null | undefined): number {
  const i = impact ? IMPACT_ORDER.indexOf(impact) : -1;
  return i === -1 ? IMPACT_ORDER.length : i;
}

export interface ProblemGroup {
  id: string;
  impact: Impact | null;
  help: string;
  helpUrl: string;
  tags: string[];
  elements: number;
  pages: { url: string; title: string | null; count: number; examples: FoundProblem["examples"] }[];
}

/** Each kind of problem across all pages, most serious first (like the command-line report). */
export function groupProblems(pages: ScanPage[]): ProblemGroup[] {
  const groups = new Map<string, ProblemGroup>();
  for (const page of pages) {
    for (const p of page.findings?.problems ?? []) {
      let g = groups.get(p.id);
      if (!g) {
        g = { id: p.id, impact: p.impact, help: p.help, helpUrl: p.helpUrl, tags: p.tags, elements: 0, pages: [] };
        groups.set(p.id, g);
      }
      if (impactRank(p.impact) < impactRank(g.impact)) g.impact = p.impact;
      g.elements += p.count;
      g.pages.push({ url: page.url, title: page.title, count: p.count, examples: p.examples });
    }
  }
  return [...groups.values()].sort((a, b) => impactRank(a.impact) - impactRank(b.impact) || b.elements - a.elements);
}

/** Turns axe tags like "wcag1410" into WCAG success criteria like "1.4.10". */
export function wcagCriteria(tags: string[]): string[] {
  return tags.flatMap((tag) => {
    const m = /^wcag(\d)(\d)(\d+)$/.exec(tag);
    return m ? [`${m[1]}.${m[2]}.${m[3]}`] : [];
  });
}
