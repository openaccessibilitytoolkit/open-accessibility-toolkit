// Run with: npm run test:scripts
import assert from "node:assert/strict";
import { test } from "node:test";
import { upgrade } from "./upgrade-config.mjs";

// What an owner's wrangler.jsonc looks like after the Deploy button: Cloudflare adds
// the database id on the same line, and there's no schedule yet.
const ownerConfig = `// Cloudflare settings for the portal. See README.md in this folder.
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "joes-bakery-portal",
  "main": "src/index.tsx",
  "compatibility_date": "2026-10-01",
  "observability": { "enabled": true },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "joes-bakery-portal",
      "migrations_dir": "migrations","database_id": "10d6aef3-638c-497a-a168-a1fe916fcf15"
    }
  ]
}
`;

test("adds the daily schedule to an owner's settings, keeping everything else", () => {
  const { text, added } = upgrade(ownerConfig);
  assert.deepEqual(added.map((u) => u.key), ["triggers"]);
  assert.match(text, /"triggers": \{ "crons": \["0 13 \* \* \*"\] \},\n  "d1_databases"/);
  for (const keep of ['"name": "joes-bakery-portal"', '"database_name": "joes-bakery-portal"', '"database_id": "10d6aef3-638c-497a-a168-a1fe916fcf15"']) {
    assert.ok(text.includes(keep), `kept ${keep}`);
  }
  // Removing what was added gives back exactly the original file.
  assert.equal(text.replace(added[0].text, ""), ownerConfig);
});

test("changes nothing when the schedule is already there", () => {
  const once = upgrade(ownerConfig).text;
  const twice = upgrade(once);
  assert.equal(twice.text, once);
  assert.equal(twice.added.length, 0);
});

test("never replaces an owner's own schedule", () => {
  const custom = ownerConfig.replace('  "d1_databases"', '  "triggers": { "crons": ["0 8 * * 1"] },\n  "d1_databases"');
  assert.equal(upgrade(custom).text, custom);
});

test("stops with a clear message if the settings file looks unfamiliar", () => {
  assert.throws(() => upgrade("{}"), /Couldn't find "d1_databases"/);
});
