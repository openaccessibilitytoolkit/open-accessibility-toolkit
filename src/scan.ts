// Opens pages in a hidden browser, checks each with axe-core, and follows
// links to other pages on the same site until it reaches a page limit.

import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import type { AxeResults } from "axe-core";

/** axe-core rule tags that make up WCAG 2.2 Level A and AA. */
export const WCAG_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
];

/** Links to these kinds of files are not web pages, so the crawler skips them. */
const SKIP_EXTENSIONS =
  /\.(pdf|jpe?g|png|gif|svg|webp|avif|ico|bmp|zip|gz|rar|7z|mp3|mp4|mov|webm|wav|docx?|xlsx?|pptx?|csv|txt|xml|json|js|css|woff2?|ttf|eot|exe|dmg|msi)$/i;

export interface PageResult {
  /** The address the browser ended up on, after any redirects. */
  url: string;
  title: string;
  axe: AxeResults;
}

export interface PageError {
  url: string;
  reason: string;
}

export interface SiteScanResult {
  startUrl: string;
  scannedAt: string;
  maxPages: number;
  /** True when the scan stopped at the page limit with pages still unchecked. */
  hitLimit: boolean;
  pages: PageResult[];
  errors: PageError[];
}

export type ProgressEvent =
  | { url: string; result: PageResult }
  | { url: string; error: string };

export interface ScanOptions {
  maxPages: number;
  onProgress?: (event: ProgressEvent) => void;
}

function siteHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

/**
 * Returns the link as a clean address if it points to another page on the same
 * site, or null if the crawler should not follow it. Treats example.com and
 * www.example.com as the same site, and stays inside the folder the scan
 * started in: starting at example.com/blog/ only checks pages under /blog/,
 * while starting at the home page checks the whole site.
 */
export function sameSiteUrl(href: string, site: URL): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (!["http:", "https:", "file:"].includes(url.protocol)) return null;
  if (url.protocol !== site.protocol) return null;
  if (url.protocol !== "file:" && siteHost(url.host) !== siteHost(site.host)) return null;
  const folder = site.pathname.slice(0, site.pathname.lastIndexOf("/") + 1);
  if (!url.pathname.startsWith(folder)) return null;
  if (SKIP_EXTENSIONS.test(url.pathname)) return null;
  url.hash = "";
  return url.href;
}

function firstLine(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).split("\n")[0];
}

export async function scanSite(
  startUrl: string,
  { maxPages, onProgress }: ScanOptions,
): Promise<SiteScanResult> {
  const scannedAt = new Date().toISOString();
  const pages: PageResult[] = [];
  const errors: PageError[] = [];
  const queue = [startUrl];
  const queued = new Set(queue);
  const checked = new Set<string>();
  let site = new URL(startUrl);
  // Broken links and non-HTML pages don't count toward the limit, so also cap
  // the total number of attempts to keep a scan from running forever.
  const maxAttempts = maxPages * 3;
  let attempts = 0;

  const browser = await chromium.launch();
  try {
    // AxeBuilder needs pages from an explicit context, not browser.newPage().
    const context = await browser.newContext();
    while (queue.length > 0 && pages.length < maxPages && attempts < maxAttempts) {
      const url = queue.shift()!;
      attempts++;
      // A fresh tab per page, so one page that crashes can't break the rest.
      const page = await context.newPage();
      try {
        const response = await page.goto(url, { waitUntil: "load", timeout: 30_000 });
        if (response && response.status() >= 400) {
          throw new Error(`The server answered ${response.status()} ${response.statusText()}`.trim());
        }
        const contentType = response?.headers()["content-type"];
        if (contentType && !contentType.includes("html")) continue;

        const finalUrl = sameSiteUrl(page.url(), site) ?? page.url();
        if (pages.length === 0) {
          // Follow the site's own choice of address, e.g. example.com -> www.example.com.
          site = new URL(finalUrl);
        } else if (sameSiteUrl(finalUrl, site) === null) {
          continue; // Redirected to another site.
        }
        if (checked.has(finalUrl)) continue;
        checked.add(finalUrl);

        const axe = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
        const result: PageResult = { url: finalUrl, title: await page.title(), axe };
        pages.push(result);
        onProgress?.({ url: finalUrl, result });

        const links = await page.$$eval("a[href]", (anchors) =>
          anchors.map((a) => String((a as HTMLAnchorElement).href)),
        );
        for (const href of links) {
          const next = sameSiteUrl(href, site);
          if (next && !queued.has(next) && !checked.has(next)) {
            queued.add(next);
            queue.push(next);
          }
        }
      } catch (err) {
        const reason = firstLine(err);
        errors.push({ url, reason });
        onProgress?.({ url, error: reason });
      } finally {
        await page.close();
      }
    }
    return {
      startUrl,
      scannedAt,
      maxPages,
      hitLimit: pages.length >= maxPages && queue.length > 0,
      pages,
      errors,
    };
  } finally {
    await browser.close();
  }
}
