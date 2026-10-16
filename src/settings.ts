// Settings for each website, saved in open-a11y.config.json so the questions are
// only asked once. Built for several websites from the start.

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";

export const CONFIG_FILE = "open-a11y.config.json";

export interface SiteSettings {
  /** Short name made from the website address, e.g. "joesbakery-com". */
  id: string;
  organization: string;
  website: string;
  contactEmail: string;
  replyDays: number;
  phone?: string;
  /** Where the owner will publish the statement; the footer links here. */
  statementUrl: string;
  /** The report-a-problem form, once the owner has a portal. */
  reportProblemUrl?: string;
}

export interface Config {
  version: 1;
  sites: SiteSettings[];
}

/** The result of checking one answer: the cleaned-up value, or a friendly error. */
export type Checked<T> = { ok: true; value: T } | { ok: false; message: string };

export function checkOrganization(input: string): Checked<string> {
  const value = input.trim();
  if (!value) return { ok: false, message: "Please type your organization's name." };
  if (value.length > 200) return { ok: false, message: "Please keep the name under 200 characters." };
  return { ok: true, value };
}

export function checkWebAddress(input: string): Checked<string> {
  const value = input.trim();
  const fail = { ok: false as const, message: "Please type a web address, like https://www.example.com" };
  if (!value) return fail;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!url.hostname.includes(".")) return fail;
    return { ok: true, value: url.href };
  } catch {
    return fail;
  }
}

export function checkEmail(input: string): Checked<string> {
  const value = input.trim();
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value)
    ? { ok: true, value }
    : { ok: false, message: "Please type an email address, like hello@example.com" };
}

export function checkReplyDays(input: string): Checked<number> {
  const n = Number(input.trim());
  return Number.isInteger(n) && n >= 1 && n <= 60
    ? { ok: true, value: n }
    : { ok: false, message: "Please type a whole number of days between 1 and 60." };
}

export function checkPhone(input: string): Checked<string> {
  const value = input.trim();
  return /^[0-9+()\-.\s]{0,40}$/.test(value)
    ? { ok: true, value }
    : { ok: false, message: "Please type only numbers, spaces and + ( ) - characters." };
}

/** Makes a short, file-name-safe id from a web address, e.g. "joesbakery-com". */
export function siteId(website: string): string {
  return new URL(website).hostname
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function defaultStatementUrl(website: string): string {
  return new URL("/accessibility-statement", website).href;
}

export async function loadConfig(file = CONFIG_FILE): Promise<Config> {
  if (!existsSync(file)) return { version: 1, sites: [] };
  const data = JSON.parse(await readFile(file, "utf8")) as Partial<Config>;
  if (!Array.isArray(data.sites)) throw new Error(`${file} does not look like an open-a11y settings file.`);
  return { version: 1, sites: data.sites };
}

export async function saveConfig(config: Config, file = CONFIG_FILE): Promise<void> {
  await writeFile(file, JSON.stringify(config, null, 2) + "\n", "utf8");
}

/** Asks questions one line at a time. Works when typed by a person or piped in. */
export class Prompter {
  private readonly rl;
  private readonly lines: AsyncIterator<string>;

  constructor(
    input: NodeJS.ReadableStream = process.stdin,
    private readonly output: NodeJS.WritableStream = process.stdout,
  ) {
    this.rl = createInterface({ input, crlfDelay: Infinity, terminal: false });
    this.lines = this.rl[Symbol.asyncIterator]();
  }

  async ask<T>(question: string, check: (answer: string) => Checked<T>, defaultValue = ""): Promise<T> {
    for (;;) {
      this.output.write(`${question}${defaultValue ? ` [${defaultValue}]` : ""} `);
      const next = await this.lines.next();
      if (next.done) throw new Error("No answer was given, so nothing was saved.");
      const answer = next.value.trim() || defaultValue;
      const result = check(answer);
      if (result.ok) return result.value;
      this.output.write(`  ${result.message}\n`);
    }
  }

  close(): void {
    this.rl.close();
  }
}

/** Asks the statement questions. Existing answers are offered as defaults. */
export async function askSiteSettings(
  prompter: Prompter,
  current?: SiteSettings,
): Promise<SiteSettings> {
  const organization = await prompter.ask(
    "Organization name?",
    checkOrganization,
    current?.organization,
  );
  const website = await prompter.ask("Website address?", checkWebAddress, current?.website);
  const contactEmail = await prompter.ask(
    "Email for accessibility problems?",
    checkEmail,
    current?.contactEmail,
  );
  const replyDays = await prompter.ask(
    "How many working days to reply?",
    checkReplyDays,
    String(current?.replyDays ?? 5),
  );
  const phone = await prompter.ask(
    "Phone number? (optional, press Enter to skip)",
    checkPhone,
    current?.phone,
  );
  const statementUrl = await prompter.ask(
    "Where will you publish the statement?",
    checkWebAddress,
    current?.statementUrl ?? defaultStatementUrl(website),
  );
  const reportProblemUrl = await prompter.ask(
    "Report-a-problem page? (optional, for when your portal is set up; press Enter to skip)",
    (answer) => (answer.trim() ? checkWebAddress(answer) : { ok: true, value: "" }),
    current?.reportProblemUrl,
  );
  return {
    id: siteId(website),
    organization,
    website,
    contactEmail,
    replyDays,
    ...(phone ? { phone } : {}),
    statementUrl,
    ...(reportProblemUrl ? { reportProblemUrl } : {}),
  };
}
