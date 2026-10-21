// Tests "Check my website" with a pretend browser: no real website or browser is used.

import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createSession } from "../src/auth.js";
import {
  BrowserUnavailable,
  getScan,
  groupProblems,
  listScanPages,
  runScanStep,
  sameSiteUrl,
  startScan,
  type CheckOutcome,
  type FoundProblem,
  type PageChecker,
} from "../src/scans.js";

const ORIGIN = "https://portal.test";
const OWNER = "owner@joesbakery.com"; // in ADMIN_EMAILS for tests
const DESIGNER = "web@designer.example"; // limited to the cafe

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM scan_pages"),
    env.DB.prepare("DELETE FROM scans"),
    env.DB.prepare("DELETE FROM person_sites"),
    env.DB.prepare("DELETE FROM people"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM sites"),
    env.DB.prepare(
      `INSERT INTO sites (id, organization, website, contact_email, created_at, updated_at, reviewed_at) VALUES
       ('joesbakery-com', 'Joe''s Bakery', 'https://joesbakery.com/', 'hello@joesbakery.com', '2026-10-01', '2026-10-01', '2026-10-01'),
       ('joescafe-com', 'Joe''s Cafe', 'https://joescafe.com/', 'cafe@joescafe.com', '2026-10-01', '2026-10-01', '2026-10-01')`,
    ),
    env.DB.prepare(`INSERT INTO people (email, all_sites, added_by, added_at) VALUES ('${DESIGNER}', 0, '${OWNER}', '2026-10-18')`),
    env.DB.prepare(`INSERT INTO person_sites (email, site_id) VALUES ('${DESIGNER}', 'joescafe-com')`),
  ]);
});

const missingAlt: FoundProblem = {
  id: "image-alt",
  impact: "critical",
  help: "Images must have alternative text",
  helpUrl: "https://dequeuniversity.com/rules/axe/4.14/image-alt",
  tags: ["wcag2a", "wcag111"],
  count: 2,
  examples: [{ target: "img.cake", html: `<img src="cake.jpg" class="cake">` }],
};
const lowContrast: FoundProblem = {
  id: "color-contrast",
  impact: "serious",
  help: "Elements must meet minimum color contrast ratio thresholds",
  helpUrl: "https://dequeuniversity.com/rules/axe/4.14/color-contrast",
  tags: ["wcag2aa", "wcag143"],
  count: 1,
  examples: [{ target: "p.light", html: `<p class="light">Fresh bread</p>`, detail: "Text color #999999 on background #ffffff has a contrast of 2.85:1. It needs at least 4.5:1." }],
};

/** A pretend website: each address gives a page with these links and problems. */
const BAKERY: Record<string, { links: string[]; problems: FoundProblem[] } | "broken"> = {
  "https://joesbakery.com/": {
    links: [
      "https://joesbakery.com/menu",
      "https://www.joesbakery.com/about#team", // same website, www and a #part
      "https://elsewhere.example/", // another website: never followed
      "https://joesbakery.com/menu.pdf", // not a web page
      "mailto:hello@joesbakery.com",
    ],
    problems: [missingAlt],
  },
  "https://joesbakery.com/menu": { links: ["https://joesbakery.com/", "https://joesbakery.com/gone"], problems: [missingAlt, lowContrast] },
  "https://www.joesbakery.com/about": { links: [], problems: [] },
  "https://joesbakery.com/gone": "broken",
};

function fakeChecker(log: string[], site = BAKERY): (session: string | null) => Promise<PageChecker> {
  return async (session) => {
    log.push(`open ${session ?? "new"}`);
    return {
      sessionId: "session-1",
      async check(url): Promise<CheckOutcome> {
        log.push(`check ${url}`);
        const page = site[url];
        if (!page) return { kind: "error", url, reason: "Not in the pretend website" };
        if (page === "broken") return { kind: "error", url, reason: "The website answered with error 404." };
        return { kind: "page", url, title: `Page ${new URL(url).pathname}`, links: page.links, findings: { problems: page.problems, needsReview: [] } };
      },
      async pause() {
        log.push("pause");
      },
      async finish() {
        log.push("finish");
      },
    };
  };
}

async function runToEnd(scanId: number, open: (session: string | null) => Promise<PageChecker>) {
  for (let i = 0; i < 30; i++) {
    const scan = (await getScan(env.DB, "joesbakery-com", scanId))!;
    const result = await runScanStep(env.DB, scan, open, new Date());
    if (result.state === "finished") return result;
  }
  throw new Error("The check never finished");
}

describe("which links a check follows", () => {
  const site = new URL("https://joesbakery.com/");
  it("follows pages on the same website, with or without www", () => {
    expect(sameSiteUrl("https://joesbakery.com/menu#cakes", site)).toBe("https://joesbakery.com/menu");
    expect(sameSiteUrl("https://www.joesbakery.com/about", site)).toBe("https://www.joesbakery.com/about");
  });
  it("never follows other websites, files or other kinds of links", () => {
    for (const href of ["https://elsewhere.example/", "https://joesbakery.com.evil.example/", "https://joesbakery.com/menu.pdf", "mailto:a@b.c", "javascript:alert(1)", "not a link"]) {
      expect(sameSiteUrl(href, site), href).toBeNull();
    }
  });
});

describe("running a check", () => {
  it("checks the home page, follows links on the same website, and records everything", async () => {
    const id = await startScan(env.DB, "joesbakery-com", "https://joesbakery.com/", OWNER, new Date());
    const log: string[] = [];
    const result = await runToEnd(id, fakeChecker(log));
    expect(result.message).toBe("Finished: checked 3 pages.");
    expect(log.filter((l) => l.startsWith("check"))).toEqual([
      "check https://joesbakery.com/",
      "check https://joesbakery.com/menu",
      "check https://www.joesbakery.com/about",
      "check https://joesbakery.com/gone",
    ]);
    // One browser for the whole check, kept between pages and closed at the end.
    expect(log.filter((l) => l.startsWith("open"))).toEqual(["open new", "open session-1", "open session-1", "open session-1"]);
    expect(log.at(-1)).toBe("finish");

    const pages = await listScanPages(env.DB, id);
    expect(pages.map((p) => [p.url, p.error])).toEqual([
      ["https://joesbakery.com/", null],
      ["https://joesbakery.com/menu", null],
      ["https://www.joesbakery.com/about", null],
      ["https://joesbakery.com/gone", "The website answered with error 404."],
    ]);
    const scan = (await getScan(env.DB, "joesbakery-com", id))!;
    expect(scan.status).toBe("done");
    expect(scan.browser_session).toBeNull();
  });

  it("stops at the page limit", async () => {
    const many: typeof BAKERY = { "https://joesbakery.com/": { links: [], problems: [] } };
    for (let i = 0; i < 30; i++) {
      (many["https://joesbakery.com/"] as { links: string[] }).links.push(`https://joesbakery.com/p${i}`);
      many[`https://joesbakery.com/p${i}`] = { links: [], problems: [] };
    }
    const id = await startScan(env.DB, "joesbakery-com", "https://joesbakery.com/", OWNER, new Date());
    const result = await runToEnd(id, fakeChecker([], many));
    expect(result.message).toBe("Finished: checked 10 pages.");
  });

  it("groups problems across pages, most serious first", async () => {
    const id = await startScan(env.DB, "joesbakery-com", "https://joesbakery.com/", OWNER, new Date());
    await runToEnd(id, fakeChecker([]));
    const groups = groupProblems(await listScanPages(env.DB, id));
    expect(groups.map((g) => [g.id, g.impact, g.elements, g.pages.length])).toEqual([
      ["image-alt", "critical", 4, 2],
      ["color-contrast", "serious", 1, 1],
    ]);
  });

  it("stops with a plain explanation when the free daily allowance is used up", async () => {
    const id = await startScan(env.DB, "joesbakery-com", "https://joesbakery.com/", OWNER, new Date());
    const scan = (await getScan(env.DB, "joesbakery-com", id))!;
    const result = await runScanStep(env.DB, scan, async () => {
      throw new BrowserUnavailable("Browser time limit exceeded for today", true);
    }, new Date());
    expect(result.state).toBe("finished");
    const after = (await getScan(env.DB, "joesbakery-com", id))!;
    expect(after.status).toBe("stopped");
    expect(after.note).toContain("free allowance for checking pages is used up for today");
  });

  it("waits and tries again when the browser is only busy", async () => {
    const id = await startScan(env.DB, "joesbakery-com", "https://joesbakery.com/", OWNER, new Date());
    const scan = (await getScan(env.DB, "joesbakery-com", id))!;
    const result = await runScanStep(env.DB, scan, async () => {
      throw new BrowserUnavailable("Cloudflare's browser is busy. Trying again in 20 seconds...", false, 20_000);
    }, new Date());
    expect(result).toMatchObject({ state: "running", waitMs: 20_000 });
    expect((await getScan(env.DB, "joesbakery-com", id))!.status).toBe("running");
    // And it carries on normally afterwards.
    expect((await runToEnd(id, fakeChecker([]))).message).toBe("Finished: checked 3 pages.");
  });

  it("never checks the same page twice when two steps arrive at once", async () => {
    const id = await startScan(env.DB, "joesbakery-com", "https://joesbakery.com/", OWNER, new Date());
    const scan = (await getScan(env.DB, "joesbakery-com", id))!;
    const log: string[] = [];
    const [a, b] = await Promise.all([
      runScanStep(env.DB, scan, fakeChecker(log), new Date()),
      runScanStep(env.DB, scan, fakeChecker(log), new Date()),
    ]);
    expect(log.filter((l) => l.startsWith("check"))).toEqual(["check https://joesbakery.com/"]);
    expect([a.state, b.state]).toEqual(["running", "running"]);
  });

  it("keeps only the 20 most recent checks of each website", async () => {
    for (let i = 0; i < 22; i++) await startScan(env.DB, "joesbakery-com", "https://joesbakery.com/", OWNER, new Date(Date.UTC(2026, 9, 1, 0, i)));
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM scans WHERE site_id = 'joesbakery-com'").first<{ n: number }>();
    expect(count?.n).toBe(20);
  });
});

async function cookieFor(email: string) {
  return `__Host-a11y_session=${await createSession(env.DB, email, Date.now())}`;
}

async function get(path: string, email = OWNER) {
  return SELF.fetch(`${ORIGIN}${path}`, { redirect: "manual", headers: { Cookie: await cookieFor(email) } });
}

async function post(path: string, email = OWNER, accept?: string) {
  return SELF.fetch(`${ORIGIN}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      Cookie: await cookieFor(email),
      Origin: ORIGIN,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(accept ? { Accept: accept } : {}),
    },
    body: "",
  });
}

describe("the Check my website pages", () => {
  it("offers a check on each website's page", async () => {
    const html = await (await get("/admin/sites/joesbakery-com")).text();
    expect(html).toContain("Check your website for accessibility problems");
    expect(html).toContain(`action="/admin/sites/joesbakery-com/scan"`);
  });

  it("starts a check and shows its progress, with a button that works without the script", async () => {
    const res = await post("/admin/sites/joesbakery-com/scan");
    expect(res.status).toBe(303);
    const location = res.headers.get("Location")!;
    expect(location).toMatch(/^\/admin\/sites\/joesbakery-com\/scans\/\d+$/);
    const html = await (await get(location)).text();
    expect(html).toContain("Checking your website");
    expect(html).toContain("Check the next page");
    expect(html).toContain(`<script src="/admin/scan.js" defer=""></script>`);
    // Pressing it again while a check runs goes back to that check, not a new one.
    expect((await post("/admin/sites/joesbakery-com/scan")).headers.get("Location")).toBe(location);
  });

  it("shows what was found in plain English, with an honest note", async () => {
    // An earlier check of the same pages, before the problems appeared.
    const clean = Object.fromEntries(Object.entries(BAKERY).map(([url, page]) => [url, page === "broken" ? page : { ...page, problems: [] }]));
    const earlier = await startScan(env.DB, "joesbakery-com", "https://joesbakery.com/", OWNER, new Date("2026-10-01T12:00:00Z"));
    await runToEnd(earlier, fakeChecker([], clean));
    // A check that stopped before checking anything isn't used for the comparison.
    const stopped = await startScan(env.DB, "joesbakery-com", "https://joesbakery.com/", OWNER, new Date("2026-10-10T12:00:00Z"));
    await env.DB.prepare("UPDATE scans SET status = 'stopped' WHERE id = ?").bind(stopped).run();
    const id = await startScan(env.DB, "joesbakery-com", "https://joesbakery.com/", OWNER, new Date("2026-10-20T12:00:00Z"));
    await runToEnd(id, fakeChecker([]));
    const html = await (await get(`/admin/sites/joesbakery-com/scans/${id}?finished=1`)).text();
    expect(html).toContain("The check has finished.");
    expect(html).toContain("Found 2 kinds of problem on 2 of the 3 pages checked, affecting 5 elements.");
    expect(html).toContain("Your previous check, on");
    expect(html).toContain("no problems found by the automated checks on 3 pages");
    expect(html).toContain("Automated checks find only some kinds of problems");
    expect(html).toContain("Images need a text description"); // the plain-English title
    expect(html).toContain(`<strong class="impact critical">Critical</strong>`);
    expect(html).toContain("WCAG 1.1.1");
    expect(html).toContain("has a contrast of 2.85:1");
    expect(html).toContain("Pages we couldn&#39;t check");
    expect(html).not.toContain("compliant");
  });

  it("answers the script in JSON, and finishes a check with nothing left to do without a browser", async () => {
    const id = await startScan(env.DB, "joesbakery-com", "https://joesbakery.com/", OWNER, new Date());
    await env.DB.prepare("UPDATE scans SET queue = '[]' WHERE id = ?").bind(id).run();
    const res = await post(`/admin/sites/joesbakery-com/scans/${id}/next`, OWNER, "application/json");
    expect(await res.json()).toEqual({ state: "finished", checked: 0, message: "Finished: checked 0 pages." });
  });

  it("can be stopped, keeping what was checked", async () => {
    const id = await startScan(env.DB, "joesbakery-com", "https://joesbakery.com/", OWNER, new Date());
    expect((await post(`/admin/sites/joesbakery-com/scans/${id}/stop`)).status).toBe(303);
    const scan = (await getScan(env.DB, "joesbakery-com", id))!;
    expect(scan.status).toBe("stopped");
    expect(scan.note).toBe("You stopped this check.");
  });

  it("doesn't let people check or see websites they don't have access to", async () => {
    const id = await startScan(env.DB, "joesbakery-com", "https://joesbakery.com/", OWNER, new Date());
    expect((await post("/admin/sites/joesbakery-com/scan", DESIGNER)).status).toBe(404);
    expect((await get(`/admin/sites/joesbakery-com/scans/${id}`, DESIGNER)).status).toBe(404);
    expect((await post(`/admin/sites/joesbakery-com/scans/${id}/next`, DESIGNER)).status).toBe(404);
    // Nor reach a bakery check through the cafe's address.
    expect((await get(`/admin/sites/joescafe-com/scans/${id}`, DESIGNER)).status).toBe(404);
    // Their own website is fine.
    expect((await post("/admin/sites/joescafe-com/scan", DESIGNER)).status).toBe(303);
  });

  it("deletes a website's checks with the website", async () => {
    const id = await startScan(env.DB, "joesbakery-com", "https://joesbakery.com/", OWNER, new Date());
    await runToEnd(id, fakeChecker([]));
    await post("/admin/sites/joesbakery-com/delete");
    const left = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM scans) + (SELECT COUNT(*) FROM scan_pages) AS n").first<{ n: number }>();
    expect(left?.n).toBe(0);
  });

  it("serves the script that keeps a check going", async () => {
    const res = await SELF.fetch(`${ORIGIN}/admin/scan.js`);
    expect(res.headers.get("Content-Type")).toContain("javascript");
    expect(await res.text()).toContain("data-scan-step");
  });
});
