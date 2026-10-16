import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  Prompter,
  askSiteSettings,
  checkEmail,
  checkPhone,
  checkReplyDays,
  checkWebAddress,
  defaultStatementUrl,
  siteId,
} from "../src/settings.js";

describe("answer checks", () => {
  it("accepts a web address with or without https://", () => {
    expect(checkWebAddress("joesbakery.com")).toEqual({ ok: true, value: "https://joesbakery.com/" });
    expect(checkWebAddress("http://joesbakery.com/shop")).toEqual({ ok: true, value: "http://joesbakery.com/shop" });
    expect(checkWebAddress("joes bakery").ok).toBe(false);
    expect(checkWebAddress("localhost").ok).toBe(false);
    expect(checkWebAddress("").ok).toBe(false);
  });

  it("checks email addresses", () => {
    expect(checkEmail(" hello@joesbakery.com ")).toEqual({ ok: true, value: "hello@joesbakery.com" });
    expect(checkEmail("hello").ok).toBe(false);
    expect(checkEmail("a@b").ok).toBe(false);
  });

  it("checks reply days", () => {
    expect(checkReplyDays("5")).toEqual({ ok: true, value: 5 });
    expect(checkReplyDays("0").ok).toBe(false);
    expect(checkReplyDays("2.5").ok).toBe(false);
    expect(checkReplyDays("ten").ok).toBe(false);
  });

  it("allows an empty or normal phone number only", () => {
    expect(checkPhone("").ok).toBe(true);
    expect(checkPhone("+1 (555) 010-0100").ok).toBe(true);
    expect(checkPhone("<b>call</b>").ok).toBe(false);
  });
});

describe("siteId and defaultStatementUrl", () => {
  it("makes a short, safe name from the address", () => {
    expect(siteId("https://www.Joes-Bakery.co.uk/shop")).toBe("joes-bakery-co-uk");
  });

  it("suggests /accessibility-statement on the same site", () => {
    expect(defaultStatementUrl("https://joesbakery.com/shop/")).toBe("https://joesbakery.com/accessibility-statement");
  });
});

function scripted(answers: string[]) {
  const input = new PassThrough();
  const output = new PassThrough();
  let shown = "";
  output.on("data", (chunk) => (shown += chunk));
  input.end(answers.map((a) => `${a}\n`).join(""));
  return { prompter: new Prompter(input, output), shown: () => shown };
}

describe("askSiteSettings", () => {
  it("asks again after a wrong answer, and skips optional questions", async () => {
    const { prompter, shown } = scripted([
      "Joe's Bakery",
      "joesbakery.com",
      "not an email",
      "hello@joesbakery.com",
      "",
      "",
      "",
      "",
    ]);
    const site = await askSiteSettings(prompter);
    prompter.close();
    expect(site).toEqual({
      id: "joesbakery-com",
      organization: "Joe's Bakery",
      website: "https://joesbakery.com/",
      contactEmail: "hello@joesbakery.com",
      replyDays: 5,
      statementUrl: "https://joesbakery.com/accessibility-statement",
    });
    expect(shown()).toContain("Please type an email address");
  });

  it("keeps earlier answers when Enter is pressed", async () => {
    const current = {
      id: "joesbakery-com",
      organization: "Joe's Bakery",
      website: "https://joesbakery.com/",
      contactEmail: "hello@joesbakery.com",
      replyDays: 3,
      phone: "555-0100",
      statementUrl: "https://joesbakery.com/accessibility",
      reportProblemUrl: "https://help.joesbakery.com/report",
    };
    const { prompter } = scripted(["", "", "", "", "", "", ""]);
    expect(await askSiteSettings(prompter, current)).toEqual(current);
    prompter.close();
  });

  it("stops with a clear message if the answers run out", async () => {
    const { prompter } = scripted(["Joe's Bakery"]);
    await expect(askSiteSettings(prompter)).rejects.toThrow("No answer was given");
    prompter.close();
  });
});
