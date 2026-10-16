// Builds small, fake scan results so report tests don't need a browser.

import type { AxeResults, NodeResult, Result } from "axe-core";
import type { PageResult, SiteScanResult } from "../src/scan.js";

export function fakeNode(html: string, target = "img"): NodeResult {
  return {
    html,
    target: [target],
    any: [],
    all: [],
    none: [],
    failureSummary: "Fix any of the following:\n  Element does not have an alt attribute",
  } as unknown as NodeResult;
}

export function fakeRule(id: string, impact: Result["impact"], nodes: NodeResult[]): Result {
  return {
    id,
    impact,
    tags: ["wcag2a", "wcag111"],
    description: `Description of ${id}`,
    help: `Help for ${id}`,
    helpUrl: `https://dequeuniversity.com/rules/axe/4.14/${id}`,
    nodes,
  } as Result;
}

export function fakePage(
  url: string,
  violations: Result[],
  incomplete: Result[] = [],
  title = `Page ${url}`,
): PageResult {
  return {
    url,
    title,
    axe: {
      violations,
      incomplete,
      passes: [],
      inapplicable: [],
      testEngine: { name: "axe-core", version: "4.14.0" },
    } as unknown as AxeResults,
  };
}

export function fakeScan(pages: PageResult[], extra: Partial<SiteScanResult> = {}): SiteScanResult {
  return {
    startUrl: pages[0]?.url ?? "https://example.com/",
    scannedAt: "2026-10-16T12:00:00.000Z",
    maxPages: 25,
    hitLimit: false,
    pages,
    errors: [],
    ...extra,
  };
}
