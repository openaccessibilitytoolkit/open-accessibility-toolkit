import { describe, expect, it } from "vitest";
import { looksAutomated, visitorKey } from "../src/safeguards.js";
import { isEmail, validateReport } from "../src/validate.js";

describe("validateReport", () => {
  it("accepts a report with only a description", () => {
    expect(validateReport({ description: "  The menu won't open.  " })).toEqual({
      values: { description: "The menu won't open.", page: "", email: "", assistiveTech: [] },
      errors: [],
    });
  });

  it("asks for a description", () => {
    expect(validateReport({ description: "   " }).errors).toEqual([
      { field: "description", message: "Please tell us what went wrong." },
    ]);
  });

  it("checks the email only when one is given", () => {
    expect(validateReport({ description: "x", email: "nope" }).errors[0].field).toBe("email");
    expect(validateReport({ description: "x", email: "a@b.co" }).errors).toEqual([]);
  });

  it("limits very long answers", () => {
    const errors = validateReport({ description: "x".repeat(5001), page: "p".repeat(501) }).errors;
    expect(errors.map((e) => e.field)).toEqual(["description", "page"]);
  });

  it("keeps only the known choices for how the site was used, once each", () => {
    const { values } = validateReport({ description: "x", assistive: ["keyboard", "hacker", "keyboard", "zoom"] });
    expect(values.assistiveTech).toEqual(["keyboard", "zoom"]);
  });

  it("recognises email addresses", () => {
    expect(isEmail("hello@joesbakery.com")).toBe(true);
    expect(isEmail("hello@joesbakery")).toBe(false);
    expect(isEmail("<script>@x.co")).toBe(false);
  });
});

describe("safeguards", () => {
  const now = 1_000_000;

  it("treats a filled-in hidden field as a robot", () => {
    expect(looksAutomated({ website: "http://spam.example" }, now)).toBe(true);
    expect(looksAutomated({ website: "" }, now)).toBe(false);
  });

  it("treats a form sent within 3 seconds as a robot", () => {
    expect(looksAutomated({ started: String(now - 1000) }, now)).toBe(true);
    expect(looksAutomated({ started: String(now - 5000) }, now)).toBe(false);
    expect(looksAutomated({}, now)).toBe(false);
  });

  it("never keeps the IP address itself", async () => {
    const key = await visitorKey("203.0.113.7", "joesbakery-com", "salt");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain("203.0.113.7");
    expect(await visitorKey("203.0.113.7", "joesbakery-com", "other-salt")).not.toBe(key);
  });
});
