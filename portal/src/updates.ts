// "Update my portal" from inside the portal. The portal can't update itself: the update
// runs in the owner's own copy on GitHub. So the portal knows its own version, checks the
// project's latest version once a day (and when an owner asks), tells owners when there's
// a new one, and links straight to their copy's "Update my portal" page on GitHub.
// No GitHub key is stored, and nothing is changed without the owner clicking.

import { createContext } from "hono/jsx";
import { version } from "../package.json";
import { getSetting, setSetting } from "./db.js";

/** This portal's version, from package.json (each update brings the new one). */
export const PORTAL_VERSION: string = version;

const UPSTREAM = "https://raw.githubusercontent.com/openaccessibilitytoolkit/open-accessibility-toolkit/main";
export const CHANGELOG_URL = "https://github.com/openaccessibilitytoolkit/open-accessibility-toolkit/blob/main/CHANGELOG.md";

export const LATEST_VERSION_SETTING = "latest_version";
export const GITHUB_COPY_SETTING = "github_copy";

export interface LatestRelease {
  version: string;
  /** The headlines of what's new in that version, like "Fixed: the People table stays inside its box". */
  notes: string[];
  checkedAt: string;
}

export interface UpdateStatus {
  current: string;
  latest: LatestRelease | null;
  /** The owner's copy on GitHub, like "m7academy/open-a11y-portal". */
  githubCopy: string | null;
}

/** What the owner pages know about updates. Only set for portal owners. */
export const UpdateContext = createContext<UpdateStatus | null>(null);

function parseVersion(v: string): number[] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m ? m.slice(1).map(Number) : null;
}

/** True when version a is newer than version b. */
export function isNewer(a: string, b: string): boolean {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

export function updateAvailable(status: UpdateStatus): boolean {
  return status.latest !== null && isNewer(status.latest.version, status.current);
}

/** The bold headlines ("- **New: People.**") of one version's section of CHANGELOG.md. */
export function changelogNotes(changelog: string, version: string): string[] {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(`## ${version} `) || l === `## ${version}`);
  if (start < 0) return [];
  const notes: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) break;
    const m = /^- \*\*(.+?)\*\*/.exec(line);
    if (m) notes.push(m[1].replace(/\.$/, "").slice(0, 200));
  }
  return notes.slice(0, 5);
}

async function upstream(path: string): Promise<string> {
  const res = await fetch(`${UPSTREAM}/${path}`, {
    signal: AbortSignal.timeout(5000),
    headers: { "User-Agent": "OpenAccessibilityToolkit-Portal/1.0 (update check)" },
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${path}`);
  return (await res.text()).slice(0, 500_000);
}

/** Asks GitHub for the project's latest version and remembers it. Returns null if GitHub couldn't be reached. */
export async function refreshLatestVersion(db: D1Database, now: Date): Promise<LatestRelease | null> {
  try {
    const latest = String((JSON.parse(await upstream("portal/package.json")) as { version?: unknown }).version ?? "");
    if (!parseVersion(latest)) throw new Error("GitHub's package.json has no version number");
    let notes: string[] = [];
    try {
      notes = changelogNotes(await upstream("CHANGELOG.md"), latest);
    } catch {
      // The version is what matters; the notes are a nice extra.
    }
    const release: LatestRelease = { version: latest, notes, checkedAt: now.toISOString() };
    await setSetting(db, LATEST_VERSION_SETTING, JSON.stringify(release));
    return release;
  } catch (e) {
    console.error("Update check failed:", e);
    return null;
  }
}

function parseRelease(value: string | null): LatestRelease | null {
  if (!value) return null;
  try {
    const r = JSON.parse(value) as LatestRelease;
    if (!parseVersion(r.version) || !Array.isArray(r.notes) || typeof r.checkedAt !== "string") return null;
    return { version: r.version, notes: r.notes.filter((n) => typeof n === "string"), checkedAt: r.checkedAt };
  } catch {
    return null;
  }
}

export async function getUpdateStatus(db: D1Database): Promise<UpdateStatus> {
  const [latest, githubCopy] = await Promise.all([getSetting(db, LATEST_VERSION_SETTING), getSetting(db, GITHUB_COPY_SETTING)]);
  return { current: PORTAL_VERSION, latest: parseRelease(latest), githubCopy: githubCopy || null };
}

/**
 * Turns what the owner typed ("https://github.com/m7academy/open-a11y-portal", with or
 * without https://, www., .git or a page after it) into "m7academy/open-a11y-portal".
 * Returns null if it isn't a GitHub copy's address.
 */
export function parseGithubCopy(input: string): string | null {
  const text = input.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  const m = /^github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})(?:[/?#].*)?$/i.exec(text);
  if (!m) return null;
  const name = m[2].replace(/\.git$/i, "");
  if (!name || name === "." || name === "..") return null;
  return `${m[1]}/${name}`;
}

/** The owner's "Update my portal" page on GitHub, where they click Run workflow. */
export function updateWorkflowUrl(githubCopy: string): string {
  return `https://github.com/${githubCopy}/actions/workflows/update-portal.yml`;
}
