#!/usr/bin/env node
// Entry point for the `open-a11y` command. Scanning arrives in step 2;
// for now this only answers --help and --version.

import { readFileSync } from "node:fs";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

const HELP = `open-a11y ${pkg.version}

Helps you find and fix website accessibility issues against WCAG 2.2 AA.
Automated checks catch only part of WCAG; people still need to verify the rest.

Usage:
  open-a11y scan <url>    Scan a website (coming soon)
  open-a11y --help        Show this help
  open-a11y --version     Show the version
`;

const [command] = process.argv.slice(2);

if (command === "--version" || command === "-v") {
  console.log(pkg.version);
} else if (command === "scan") {
  console.error("Scanning is not built yet. It arrives in the next step.");
  process.exitCode = 1;
} else {
  console.log(HELP);
}
