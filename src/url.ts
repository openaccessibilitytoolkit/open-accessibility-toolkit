// Turns what someone typed after `open-a11y scan` into an address the browser can open.

import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Accepts a full address, a bare domain like example.com, or a local HTML file. */
export function toScanUrl(input: string): string {
  if (/^(https?|file):/i.test(input)) return new URL(input).href;
  if (existsSync(input)) return pathToFileURL(path.resolve(input)).href;
  return new URL(`https://${input}`).href;
}
