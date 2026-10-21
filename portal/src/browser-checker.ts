// Checks pages in Cloudflare's browser (Browser Rendering) with axe-core, for "Check my
// website". The free plan includes 10 minutes of browser time a day, so a check reuses
// one browser session for all its pages and frees it as soon as it's done.

import { acquire, connect, limits, type Browser, type BrowserWorker } from "@cloudflare/playwright";
import AXE_SOURCE from "axe-core/axe.min.js";
import { checkPage } from "./page-check.js";
import { BrowserUnavailable, type CheckOutcome, type PageChecker } from "./scans.js";

/** How long Cloudflare keeps the browser open between pages before closing it by itself. */
const KEEP_ALIVE_MS = 60_000;

function message(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).split("\n")[0];
}

/** Turns Cloudflare's "you can't have a browser right now" answers into plain words. */
function unavailable(e: unknown): BrowserUnavailable | null {
  const text = message(e);
  if (/time limit|daily|exceeded/i.test(text)) return new BrowserUnavailable(text, true);
  if (/429|rate limit|too many|concurren/i.test(text)) {
    return new BrowserUnavailable("Cloudflare's browser is busy. Trying again in 20 seconds...", false);
  }
  return null;
}

async function openBrowser(binding: BrowserWorker, sessionId: string | null): Promise<{ browser: Browser; sessionId: string }> {
  if (sessionId) {
    try {
      return { browser: await connect(binding, sessionId), sessionId };
    } catch {
      // That session has closed (it closes by itself after a minute of nothing): start another.
    }
  }
  const allowance = await limits(binding).catch(() => null);
  if (allowance && allowance.allowedBrowserAcquisitions === 0) {
    const wait = Math.max(allowance.timeUntilNextAllowedBrowserAcquisition, 1000);
    throw new BrowserUnavailable(`Cloudflare's browser is busy. Trying again in ${Math.ceil(wait / 1000)} seconds...`, false, wait);
  }
  try {
    const session = await acquire(binding, { keep_alive: KEEP_ALIVE_MS });
    return { browser: await connect(binding, session.sessionId), sessionId: session.sessionId };
  } catch (e) {
    throw unavailable(e) ?? e;
  }
}

/** A PageChecker that uses Cloudflare's browser. */
export async function browserChecker(binding: BrowserWorker | undefined, sessionId: string | null): Promise<PageChecker> {
  if (!binding) throw new Error("Cloudflare's browser isn't connected to this portal. Press Update my portal to add it.");
  const { browser, sessionId: session } = await openBrowser(binding, sessionId);
  return {
    sessionId: session,
    async check(url: string): Promise<CheckOutcome> {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        return await checkPage(page, url, AXE_SOURCE, (e) => {
          const why = unavailable(e);
          if (why?.dailyLimit) throw why;
          return false;
        });
      } finally {
        await context.close().catch(() => {});
      }
    },
    async pause() {
      // Disconnects, leaving the browser open for the next page.
      await browser.close();
    },
    async finish() {
      // Closes the browser itself, so it stops using the daily allowance straight away.
      try {
        const cdp = await browser.newBrowserCDPSession();
        await cdp.send("Browser.close");
      } catch {
        // It closes by itself after a minute anyway.
      }
      await browser.close().catch(() => {});
    },
  };
}
