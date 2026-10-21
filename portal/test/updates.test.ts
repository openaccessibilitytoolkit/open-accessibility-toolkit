// Tests "Update my portal" inside the portal: the version check, the notice for owners,
// and the GitHub address. A pretend GitHub answers: nothing real is contacted.

import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession } from "../src/auth.js";
import worker from "../src/index.js";
import {
  LATEST_VERSION_SETTING,
  PORTAL_VERSION,
  changelogNotes,
  getUpdateStatus,
  isNewer,
  parseGithubCopy,
  refreshLatestVersion,
} from "../src/updates.js";
import { version } from "../package.json";

const ORIGIN = "https://portal.test";
const OWNER = "owner@joesbakery.com"; // in ADMIN_EMAILS for tests
const MANAGER = "manager@joesbakery.com"; // sees every website, but isn't an owner

const NEWER = "99.0.0";
const CHANGELOG = `# Changelog

## ${NEWER} (2099-01-01)

**Portal owners: press "Update my portal" to get this release.**

- **New: Something useful.** More words here.
- **Fixed: A small problem.**

## 1.0.0 (2026-10-16)

- **Scans a whole site.**
`;

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM settings WHERE key IN ('latest_version', 'github_copy')"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM people"),
    env.DB.prepare("DELETE FROM sites"),
    env.DB.prepare(`INSERT INTO people (email, all_sites, added_by, added_at) VALUES ('${MANAGER}', 1, '${OWNER}', '2026-10-18')`),
  ]);
});

afterEach(() => vi.restoreAllMocks());

/** Pretends to be GitHub, with the given latest version. */
function fakeGithub(latest = NEWER) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith("/main/portal/package.json")) return Response.json({ name: "open-a11y-portal", version: latest });
    if (url.endsWith("/main/CHANGELOG.md")) return new Response(CHANGELOG);
    return new Response("not found", { status: 404 });
  });
}

async function knowLatest(latest: string) {
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
    .bind(LATEST_VERSION_SETTING, JSON.stringify({ version: latest, notes: ["New: Something useful"], checkedAt: "2026-10-20T13:00:00Z" }))
    .run();
}

async function cookieFor(email: string) {
  return `__Host-a11y_session=${await createSession(env.DB, email, Date.now())}`;
}

async function html(path: string, email = OWNER) {
  return (await SELF.fetch(`${ORIGIN}${path}`, { headers: { Cookie: await cookieFor(email) } })).text();
}

async function post(path: string, fields: Record<string, string>, email = OWNER) {
  return SELF.fetch(`${ORIGIN}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { Cookie: await cookieFor(email), Origin: ORIGIN, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
}

describe("version numbers", () => {
  it("knows its own version from package.json", () => {
    expect(PORTAL_VERSION).toBe(version);
  });

  it("compares versions number by number", () => {
    expect(isNewer("1.2.10", "1.2.9")).toBe(true);
    expect(isNewer("2.0.0", "1.9.9")).toBe(true);
    expect(isNewer("1.2.2", "1.2.2")).toBe(false);
    expect(isNewer("1.2.1", "1.2.2")).toBe(false);
    expect(isNewer("not-a-version", "1.0.0")).toBe(false);
  });

  it("takes the headlines of one version from the changelog", () => {
    expect(changelogNotes(CHANGELOG, NEWER)).toEqual(["New: Something useful", "Fixed: A small problem"]);
    expect(changelogNotes(CHANGELOG, "1.0.0")).toEqual(["Scans a whole site"]);
    expect(changelogNotes(CHANGELOG, "5.0.0")).toEqual([]);
  });
});

describe("the GitHub address", () => {
  it("understands the ways people paste it", () => {
    for (const input of [
      "https://github.com/m7academy/open-a11y-portal",
      "github.com/m7academy/open-a11y-portal",
      "https://www.github.com/m7academy/open-a11y-portal/",
      "https://github.com/m7academy/open-a11y-portal.git",
      "https://github.com/m7academy/open-a11y-portal/actions/workflows/update-portal.yml",
      "  https://github.com/m7academy/open-a11y-portal?tab=readme  ",
    ]) {
      expect(parseGithubCopy(input), input).toBe("m7academy/open-a11y-portal");
    }
  });

  it("refuses anything that isn't a GitHub copy", () => {
    for (const input of ["https://evil.example/m7academy/x", "https://github.com/m7academy", "javascript:alert(1)", "m7academy/x", "https://github.com/../x"]) {
      expect(parseGithubCopy(input), input).toBeNull();
    }
  });
});

describe("checking for updates", () => {
  it("asks GitHub and remembers the latest version and what's new", async () => {
    fakeGithub();
    const latest = await refreshLatestVersion(env.DB, new Date("2026-10-20T13:00:00Z"));
    expect(latest).toEqual({ version: NEWER, notes: ["New: Something useful", "Fixed: A small problem"], checkedAt: "2026-10-20T13:00:00.000Z" });
    expect((await getUpdateStatus(env.DB)).latest?.version).toBe(NEWER);
  });

  it("keeps what it knew if GitHub can't be reached", async () => {
    await knowLatest("1.0.0");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await refreshLatestVersion(env.DB, new Date())).toBeNull();
    expect((await getUpdateStatus(env.DB)).latest?.version).toBe("1.0.0");
  });

  it("checks every day from the schedule", async () => {
    const github = fakeGithub();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const waiting: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => waiting.push(p), passThroughOnException: () => {} } as unknown as ExecutionContext;
    await worker.scheduled({ cron: "0 13 * * *", scheduledTime: Date.now() } as ScheduledController, env as never, ctx);
    await Promise.all(waiting);
    expect(github).toHaveBeenCalled();
    expect((await getUpdateStatus(env.DB)).latest?.version).toBe(NEWER);
  });
});

describe("telling owners", () => {
  it("shows owners a notice on every page when there's a new version", async () => {
    await knowLatest(NEWER);
    const page = await html("/admin");
    expect(page).toContain("An update is available:</strong> version 99.0.0 (you have ");
    expect(page).toContain(`href="/admin/setup#updates"`);
  });

  it("doesn't show the notice to people who aren't owners", async () => {
    await knowLatest(NEWER);
    expect(await html("/admin", MANAGER)).not.toContain("An update is available");
  });

  it("says nothing when the portal is up to date", async () => {
    await knowLatest(PORTAL_VERSION);
    expect(await html("/admin")).not.toContain("An update is available");
    const setup = await html("/admin/setup");
    expect(setup).toContain(`Done:</strong> You&#39;re on the latest version (${PORTAL_VERSION})`);
    expect(setup).not.toContain("Update my portal</a>");
  });

  it("is honest before the first check", async () => {
    const setup = await html("/admin/setup");
    expect(setup).toContain(`Couldn&#39;t check:</strong> You have version ${PORTAL_VERSION}`);
    expect(setup).toContain("Check for updates now");
  });

  it("shows what's new, with a button to the setup guide until it knows the GitHub address", async () => {
    await knowLatest(NEWER);
    const setup = await html("/admin/setup");
    expect(setup).toContain("Needs attention:</strong> Update available: version 99.0.0");
    expect(setup).toContain("<li>New: Something useful</li>");
    expect(setup).toContain(`href="https://github.com/openaccessibilitytoolkit/open-accessibility-toolkit/blob/main/docs/setup-guide.md#9-keep-your-portal-safe-and-up-to-date">Update my portal</a>`);
    // The full notice is right there, so the banner isn't repeated.
    expect(setup).not.toContain("An update is available");
  });

  it("opens the owner's own update page once the GitHub address is saved", async () => {
    await knowLatest(NEWER);
    const res = await post("/admin/setup/github-copy", { github_copy: "https://github.com/m7academy/open-a11y-portal" });
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/admin/setup?saved=github#updates");
    const setup = await html("/admin/setup?saved=github");
    expect(setup).toContain("Saved. Update my portal now opens github.com/m7academy/open-a11y-portal.");
    expect(setup).toContain(`href="https://github.com/m7academy/open-a11y-portal/actions/workflows/update-portal.yml">Update my portal</a>`);
    expect(setup).toContain(`value="https://github.com/m7academy/open-a11y-portal"`);
  });

  it("explains a wrong GitHub address", async () => {
    const res = await post("/admin/setup/github-copy", { github_copy: "https://example.com/oops" });
    expect(res.status).toBe(400);
    const page = await res.text();
    expect(page).toContain("<title>Error: Check my setup");
    expect(page).toContain("Error: Please paste your portal&#39;s GitHub address");
    expect((await getUpdateStatus(env.DB)).githubCopy).toBeNull();
  });

  it("removes the GitHub address when the box is emptied", async () => {
    await post("/admin/setup/github-copy", { github_copy: "github.com/m7academy/open-a11y-portal" });
    await post("/admin/setup/github-copy", { github_copy: "" });
    expect((await getUpdateStatus(env.DB)).githubCopy).toBeNull();
  });

  it("only lets owners change the GitHub address", async () => {
    const res = await post("/admin/setup/github-copy", { github_copy: "https://github.com/someone/else" }, MANAGER);
    expect(res.status).toBe(403);
    expect((await getUpdateStatus(env.DB)).githubCopy).toBeNull();
    expect(await html("/admin/setup", MANAGER)).not.toContain("Save GitHub address");
  });

  it("checks for updates when asked", async () => {
    fakeGithub();
    const page = await (await post("/admin/setup/check-updates", {})).text();
    expect(page).toContain("Version 99.0.0 is available. See Updates below.");
    expect(page).toContain("Update available: version 99.0.0");
  });

  it("says so when GitHub can't be reached", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const page = await (await post("/admin/setup/check-updates", {})).text();
    expect(page).toContain("We couldn&#39;t reach GitHub to check for updates.");
  });
});
