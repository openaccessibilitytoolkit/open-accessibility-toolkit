// Brings an owner's wrangler.jsonc up to date before each publish.
//
// "Update my portal" never touches wrangler.jsonc, because it holds the owner's own
// portal and database names. But new features sometimes need a new setting there,
// like the daily schedule that sends the monthly statement review reminder. This
// script runs as the first part of `npm run deploy` (which Cloudflare runs after every
// update), and adds any missing settings without changing anything that's already
// there. The change only applies to that publish; nothing is committed.
//
// To add a setting for a future update, add an entry to UPGRADES below.

import { readFileSync, writeFileSync } from "node:fs";

const FILE = new URL("../wrangler.jsonc", import.meta.url);

/** Each upgrade: a key to look for, and the text to add if it's missing. */
export const UPGRADES = [
  {
    key: "triggers",
    why: "the daily schedule that sends the monthly statement review reminder",
    text: `  // Added automatically by scripts/upgrade-config.mjs: every day at 13:00 UTC, so the
  // monthly statement review reminder can be sent.
  "triggers": { "crons": ["0 13 * * *"] },
`,
  },
  {
    key: "compatibility_flags",
    why: "Node.js support, which Cloudflare's browser library needs for Check my website",
    text: `  // Added automatically by scripts/upgrade-config.mjs: Node.js support, which
  // Cloudflare's browser library needs for "Check my website".
  "compatibility_flags": ["nodejs_compat"],
`,
  },
  {
    key: "browser",
    why: "Cloudflare's browser, for Check my website",
    text: `  // Added automatically by scripts/upgrade-config.mjs: Cloudflare's browser, for
  // "Check my website" (free plan: 10 minutes a day).
  "browser": { "binding": "BROWSER" },
`,
  },
  {
    key: "rules",
    why: "hands axe-core (the checker) to that browser as plain text",
    text: `  // Added automatically by scripts/upgrade-config.mjs: hands axe-core (the checker)
  // to that browser as plain text.
  "rules": [{ "type": "Text", "globs": ["**/axe.min.js"], "fallthrough": true }],
`,
  },
];

/** Returns the upgraded config text, and what was added. Never removes or changes existing settings. */
export function upgrade(config) {
  let text = config;
  const added = [];
  for (const u of UPGRADES) {
    if (new RegExp(`"${u.key}"\\s*:`).test(text)) continue;
    // Insert before the database settings, which every portal's config has.
    const anchor = /^([ \t]*)"d1_databases"\s*:/m;
    if (!anchor.test(text)) {
      throw new Error(`Couldn't find "d1_databases" in wrangler.jsonc, so "${u.key}" wasn't added.`);
    }
    text = text.replace(anchor, (match) => `${u.text}${match}`);
    added.push(u);
  }
  return { text, added };
}

if (import.meta.url === new URL(process.argv[1], "file://").href || process.argv[1]?.endsWith("upgrade-config.mjs")) {
  const before = readFileSync(FILE, "utf8");
  const { text, added } = upgrade(before);
  if (added.length === 0) {
    console.log("wrangler.jsonc is up to date.");
  } else {
    writeFileSync(FILE, text);
    for (const u of added) console.log(`Added "${u.key}" to wrangler.jsonc: ${u.why}.`);
  }
}
