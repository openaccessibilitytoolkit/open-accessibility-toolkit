import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { sameSiteUrl } from "../src/scan.js";
import { toScanUrl } from "../src/url.js";

describe("sameSiteUrl", () => {
  const home = new URL("https://example.com/");

  it("follows pages on the same site and drops #fragments", () => {
    expect(sameSiteUrl("https://example.com/about#team", home)).toBe("https://example.com/about");
  });

  it("treats www and non-www as the same site", () => {
    expect(sameSiteUrl("https://www.example.com/contact", home)).toBe("https://www.example.com/contact");
  });

  it("skips other sites, other protocols, and email or phone links", () => {
    expect(sameSiteUrl("https://example.org/", home)).toBeNull();
    expect(sameSiteUrl("http://example.com/", home)).toBeNull();
    expect(sameSiteUrl("mailto:joe@example.com", home)).toBeNull();
    expect(sameSiteUrl("tel:+15555550100", home)).toBeNull();
    expect(sameSiteUrl("javascript:void(0)", home)).toBeNull();
    expect(sameSiteUrl("not a url", home)).toBeNull();
  });

  it("skips files that are not web pages", () => {
    expect(sameSiteUrl("https://example.com/menu.pdf", home)).toBeNull();
    expect(sameSiteUrl("https://example.com/photo.JPG", home)).toBeNull();
    expect(sameSiteUrl("https://example.com/menu.html", home)).toBe("https://example.com/menu.html");
  });

  it("stays inside the folder the scan started in", () => {
    const blog = new URL("https://example.com/blog/index.html");
    expect(sameSiteUrl("https://example.com/blog/post-1", blog)).toBe("https://example.com/blog/post-1");
    expect(sameSiteUrl("https://example.com/shop", blog)).toBeNull();
  });

  it("stays inside the starting folder for local files", () => {
    const start = new URL("file:///C:/site/index.html");
    expect(sameSiteUrl("file:///C:/site/about.html", start)).toBe("file:///C:/site/about.html");
    expect(sameSiteUrl("file:///C:/other.html", start)).toBeNull();
  });
});

describe("toScanUrl", () => {
  it("keeps full addresses", () => {
    expect(toScanUrl("https://example.com/a")).toBe("https://example.com/a");
  });

  it("adds https:// to a bare domain", () => {
    expect(toScanUrl("example.com")).toBe("https://example.com/");
  });

  it("turns a local file path into a file address", () => {
    const file = path.join("test", "fixtures", "sample-broken.html");
    expect(toScanUrl(file)).toBe(pathToFileURL(path.resolve(file)).href);
  });
});
