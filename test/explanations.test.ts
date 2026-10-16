import { createRequire } from "node:module";
import type { NodeResult } from "axe-core";
import { describe, expect, it } from "vitest";
import { EXPLANATIONS, elementDetail } from "../src/explanations.js";
import { WCAG_TAGS } from "../src/scan.js";

const axe = createRequire(import.meta.url)("axe-core") as typeof import("axe-core");

describe("EXPLANATIONS", () => {
  const wcagRules = new Set(axe.getRules(WCAG_TAGS).map((r) => r.ruleId));

  it.each(Object.keys(EXPLANATIONS))("%s is a real WCAG rule that axe-core checks", (ruleId) => {
    expect(wcagRules.has(ruleId)).toBe(true);
  });

  it.each(Object.entries(EXPLANATIONS))("%s has every part filled in", (_, e) => {
    expect(e.title.length).toBeGreaterThan(0);
    expect(e.problem.length).toBeGreaterThan(0);
    expect(e.affects.length).toBeGreaterThan(0);
    expect(e.fix.length).toBeGreaterThan(0);
    expect(e.before).not.toBe(e.after);
  });

  it("never promises compliance", () => {
    expect(JSON.stringify(EXPLANATIONS)).not.toMatch(/complian|lawsuit/i);
  });
});

describe("elementDetail", () => {
  it("states the exact colours and contrast for contrast problems", () => {
    const node = {
      any: [
        {
          data: {
            fgColor: "#bbbbbb",
            bgColor: "#ffffff",
            contrastRatio: 1.92,
            expectedContrastRatio: "4.5:1",
          },
        },
      ],
    } as unknown as NodeResult;
    expect(elementDetail("color-contrast", node)).toBe(
      "Text color #bbbbbb on background #ffffff has a contrast of 1.92:1. It needs at least 4.5:1.",
    );
  });

  it("returns nothing when there is no extra detail to give", () => {
    expect(elementDetail("image-alt", { any: [] } as unknown as NodeResult)).toBeUndefined();
    expect(elementDetail("color-contrast", { any: [{ data: null }] } as unknown as NodeResult)).toBeUndefined();
  });
});
