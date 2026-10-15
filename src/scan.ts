// Opens one page in a hidden browser and checks it with axe-core.

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

export interface ScanResult {
  /** The address the browser ended up on, after any redirects. */
  url: string;
  title: string;
  scannedAt: string;
  axe: AxeResults;
}

export async function scanPage(url: string): Promise<ScanResult> {
  const browser = await chromium.launch();
  try {
    // AxeBuilder needs a page from an explicit context, not browser.newPage().
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "load", timeout: 30_000 });
    const axe = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    return {
      url: page.url(),
      title: await page.title(),
      scannedAt: new Date().toISOString(),
      axe,
    };
  } finally {
    await browser.close();
  }
}
