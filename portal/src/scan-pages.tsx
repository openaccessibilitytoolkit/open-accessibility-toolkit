// "Check my website": the box on each website's page, and the page that shows a check
// while it runs and what it found afterwards, in plain English.

import { AdminLayout } from "./admin.js";
import type { Site } from "./db.js";
import { explain } from "./explanations.js";
import { groupProblems, wcagCriteria, type Impact, type ProblemGroup, type Scan, type ScanPage } from "./scans.js";
import { SCAN_SCRIPT_PATH } from "./scan-script.js";
import { formatTime } from "./timeline.js";

const IMPACT_LABELS: Record<Impact, string> = {
  critical: "Critical",
  serious: "Serious",
  moderate: "Moderate",
  minor: "Minor",
};

function host(website: string): string {
  try {
    return new URL(website).host;
  } catch {
    return website;
  }
}

function plural(n: number, word: string, words = `${word}s`): string {
  return `${n} ${n === 1 ? word : words}`;
}

/** Shown on every result: the checker finds some problems, not all of them. */
function HonestNote() {
  return (
    <div class="notice">
      <p>
        <strong>Automated checks find only some kinds of problems</strong>. A clean result
        doesn't mean your website is accessible or meets the law. Also try your website with only a keyboard, and
        with a screen reader, or ask people with disabilities to test it.
      </p>
    </div>
  );
}

/** "3 kinds of problem on 5 pages", in plain words. */
function resultText(s: { pages: number; problems: number }): string {
  if (s.pages === 0) return "no pages were checked";
  const found = s.problems === 0 ? "no problems found by the automated checks" : `${plural(s.problems, "kind")} of problem`;
  return `${found} on ${plural(s.pages, "page")}`;
}

export interface ScanSummary {
  id: number;
  started_at: string;
  status: Scan["status"];
  pages: number;
  problems: number;
}

/** The "Check your website" box on a website's page. */
export function ScanCard(props: { site: Site; scans: ScanSummary[]; timeZone: string }) {
  const { site, scans } = props;
  const running = scans.find((s) => s.status === "running");
  const latest = scans.find((s) => s.status !== "running" && s.pages > 0);
  return (
    <div class="card" id="check">
      <h2>Check your website for accessibility problems</h2>
      <p>
        We open your home page and up to 9 more of its pages in a browser, and check each one for common WCAG 2.2
        problems, with the same checker as the Open Accessibility Toolkit. It takes about a minute, and you'll see what
        to fix in plain English.
      </p>
      {latest && (
        <p>
          Last check: {formatTime(latest.started_at, props.timeZone)}, {resultText(latest)}.{" "}
          <a href={`/admin/sites/${site.id}/scans/${latest.id}`}>See the results</a>
        </p>
      )}
      {running ? (
        <p>
          <a class="button-link" href={`/admin/sites/${site.id}/scans/${running.id}`}>
            See the check that's running
          </a>
        </p>
      ) : (
        <form method="post" action={`/admin/sites/${site.id}/scan`}>
          <button type="submit">Check my website</button>
        </form>
      )}
      {scans.length > 1 && (
        <details>
          <summary>Earlier checks</summary>
          <ul>
            {scans
              .filter((s) => s.status !== "running")
              .map((s) => (
                <li>
                  <a href={`/admin/sites/${site.id}/scans/${s.id}`}>{formatTime(s.started_at, props.timeZone)}</a>: {resultText(s)}
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ProblemSection(props: { group: ProblemGroup; index: number }) {
  const { group } = props;
  const explanation = explain(group.id);
  const criteria = wcagCriteria(group.tags);
  const headingId = `problem-${props.index}`;
  return (
    <section class="card problem" aria-labelledby={headingId}>
      <h3 id={headingId}>{explanation?.title ?? group.help}</h3>
      <p>
        {group.impact && <strong class={`impact ${group.impact}`}>{IMPACT_LABELS[group.impact]}</strong>}{" "}
        {plural(group.elements, "element")} on {plural(group.pages.length, "page")}
        {criteria.length > 0 && <> · WCAG {criteria.join(", ")}</>}
      </p>
      {explanation ? (
        <>
          <p>{explanation.problem}</p>
          <p>
            <strong>Who it affects:</strong> {explanation.affects}
          </p>
          <details>
            <summary>How to fix it</summary>
            <ol>
              {explanation.fix.map((step) => (
                <li>{step}</li>
              ))}
            </ol>
            <p class="code-label">Before:</p>
            <pre>
              <code>{explanation.before}</code>
            </pre>
            <p class="code-label">After:</p>
            <pre>
              <code>{explanation.after}</code>
            </pre>
          </details>
        </>
      ) : (
        <p>
          {group.help}. <a href={group.helpUrl}>Learn more about this problem</a> (Deque University, in English).
        </p>
      )}
      <details>
        <summary>Where we found it</summary>
        <ul class="found-list">
          {group.pages.map((p) => (
            <li>
              <a href={p.url}>{p.title || p.url}</a> ({plural(p.count, "element")})
              <ul>
                {p.examples.map((ex) => (
                  <li>
                    <code>{ex.html}</code>
                    {ex.detail && <p class="hint">{ex.detail}</p>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

export function ScanPage(props: {
  email: string;
  site: Site;
  scan: Scan;
  pages: ScanPage[];
  previous: ScanSummary | null;
  timeZone: string;
  justFinished?: boolean;
  progress?: string;
}) {
  const { site, scan, pages } = props;
  const checkedPages = pages.filter((p) => p.findings);
  const failedPages = pages.filter((p) => p.error);
  const groups = groupProblems(pages);
  const elements = groups.reduce((n, g) => n + g.elements, 0);
  const withProblems = checkedPages.filter((p) => (p.findings?.problems.length ?? 0) > 0).length;
  const needsReview = new Set(checkedPages.flatMap((p) => p.findings?.needsReview ?? [])).size;
  const running = scan.status === "running";
  const base = `/admin/sites/${site.id}/scans/${scan.id}`;
  return (
    <AdminLayout title={`Accessibility check of ${host(site.website)}`} email={props.email} section="sites">
      {props.justFinished && !running && (
        <div class="saved" tabindex={-1} autofocus>
          <p>The check has finished. The results are below.</p>
        </div>
      )}
      <p>
        <a href={`/admin/sites/${site.id}#check`}>Back to {host(site.website)}</a>
      </p>
      <h1>Accessibility check of {host(site.website)}</h1>
      <p class="lead">
        Started {formatTime(scan.started_at, props.timeZone)} by {scan.started_by}. Checked against WCAG 2.2 Level A and
        AA automated rules.
      </p>

      {running ? (
        <div class="card">
          <h2>Checking your website</h2>
          <p id="scan-status" role="status">
            {props.progress ?? `Checked ${plural(checkedPages.length, "page")} so far.`}
          </p>
          <form method="post" action={`${base}/next`} data-scan-step data-scan-status="scan-status" data-scan-done={`${base}?finished=1`}>
            <button type="submit">Check the next page</button>
          </form>
          <p class="hint">Keep this page open while the check runs. If you leave, it waits here until you come back.</p>
          <form method="post" action={`${base}/stop`}>
            <button type="submit" class="secondary-button">
              Stop the check
            </button>
          </form>
          <script src={SCAN_SCRIPT_PATH} defer></script>
        </div>
      ) : (
        <>
          {scan.note && (
            <div class="notice">
              <p>{scan.note}</p>
            </div>
          )}
          <h2>Summary</h2>
          <p>
            {checkedPages.length === 0
              ? "No pages were checked, so there are no results yet."
              : groups.length === 0
              ? `The automated checks found no problems on the ${plural(checkedPages.length, "page")} checked.`
              : `Found ${plural(groups.length, "kind")} of problem on ${withProblems} of the ${plural(checkedPages.length, "page")} checked, affecting ${plural(elements, "element")}.`}
            {needsReview > 0 && ` ${plural(needsReview, "check")} also need${needsReview === 1 ? "s" : ""} a person to decide.`}
          </p>
          {props.previous && (
            <p>
              Your previous check, on {formatTime(props.previous.started_at, props.timeZone)}: {resultText(props.previous)}.
            </p>
          )}
          <HonestNote />

          {groups.length > 0 && (
            <>
              <h2>What to fix, most serious first</h2>
              {groups.map((g, i) => (
                <ProblemSection group={g} index={i} />
              ))}
            </>
          )}

          <h2>Pages checked</h2>
          <ul class="url-list">
            {checkedPages.map((p) => (
              <li>
                <a href={p.url}>{p.title || p.url}</a>:{" "}
                {p.findings!.problems.length === 0 ? "no problems found" : plural(p.findings!.problems.length, "kind") + " of problem"}
              </li>
            ))}
          </ul>
          {failedPages.length > 0 && (
            <>
              <h3>Pages we couldn't check</h3>
              <ul class="url-list">
                {failedPages.map((p) => (
                  <li>
                    {p.url}: {p.error}
                  </li>
                ))}
              </ul>
            </>
          )}
          <form method="post" action={`/admin/sites/${site.id}/scan`}>
            <button type="submit">Check again</button>
          </form>
        </>
      )}
    </AdminLayout>
  );
}
