// Checks the "Add a website" / "Edit website" form. Pure functions, easy to test.

import type { Site, SiteInput } from "./db.js";
import { isEmail } from "./validate.js";

export const SITE_LIMITS = { organization: 200, notifyEmails: 10, knownProblems: 50, knownProblem: 300 };

export type SiteField =
  | "organization"
  | "website"
  | "contactEmail"
  | "replyDays"
  | "phone"
  | "notifyEmails"
  | "knownProblems";

export interface SiteFieldError {
  field: SiteField;
  message: string;
}

/** What the owner typed, kept as text so the form can be shown again exactly as typed. */
export interface SiteFormValues {
  organization: string;
  website: string;
  contactEmail: string;
  replyDays: string;
  phone: string;
  notifyEmails: string;
  knownProblems: string;
}

type FormValue = string | File | (string | File)[] | undefined;

function text(value: FormValue): string {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first.trim() : "";
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** "joesbakery.com" or "https://www.joesbakery.com/shop" becomes "https://www.joesbakery.com/shop". */
export function normalizeWebsite(input: string): string | null {
  if (!input) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    return url.hostname.includes(".") ? url.href : null;
  } catch {
    return null;
  }
}

/** A short, fixed name for a website, used in its public addresses, e.g. "joesbakery-com". */
export function siteIdFor(website: string): string {
  return new URL(website).hostname
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function formValuesFromSite(site: Site): SiteFormValues {
  let notify: string[] = [];
  try {
    notify = JSON.parse(site.notify_emails || "[]");
  } catch {
    // Show an empty list rather than failing.
  }
  return {
    organization: site.organization,
    website: site.website,
    contactEmail: site.contact_email,
    replyDays: String(site.reply_days),
    phone: site.phone ?? "",
    notifyEmails: notify.join("\n"),
    knownProblems: site.known_problems,
  };
}

export const EMPTY_SITE_FORM: SiteFormValues = {
  organization: "",
  website: "",
  contactEmail: "",
  replyDays: "5",
  phone: "",
  notifyEmails: "",
  knownProblems: "",
};

export function validateSite(form: Record<string, FormValue>): {
  values: SiteFormValues;
  input: SiteInput | null;
  errors: SiteFieldError[];
} {
  const values: SiteFormValues = {
    organization: text(form.organization),
    website: text(form.website),
    contactEmail: text(form.contactEmail),
    replyDays: text(form.replyDays),
    phone: text(form.phone),
    notifyEmails: text(form.notifyEmails),
    knownProblems: text(form.knownProblems),
  };
  const errors: SiteFieldError[] = [];

  if (!values.organization) errors.push({ field: "organization", message: "Please type your organization's name." });
  else if (values.organization.length > SITE_LIMITS.organization) {
    errors.push({ field: "organization", message: `Please keep the name under ${SITE_LIMITS.organization} characters.` });
  }

  const website = normalizeWebsite(values.website);
  if (!website) errors.push({ field: "website", message: "Please type your website's address, like joesbakery.com" });

  if (!isEmail(values.contactEmail)) {
    errors.push({ field: "contactEmail", message: "Please type an email address, like hello@example.com" });
  }

  const replyDays = Number(values.replyDays);
  if (!Number.isInteger(replyDays) || replyDays < 1 || replyDays > 60) {
    errors.push({ field: "replyDays", message: "Please type a whole number of days between 1 and 60." });
  }

  if (!/^[0-9+()\-.\s]{0,40}$/.test(values.phone)) {
    errors.push({ field: "phone", message: "Please type only numbers, spaces and + ( ) - characters, or leave it empty." });
  }

  const notifyEmails = [...new Set(lines(values.notifyEmails).map((e) => e.toLowerCase()))];
  const badEmail = notifyEmails.find((e) => !isEmail(e));
  if (badEmail) {
    errors.push({ field: "notifyEmails", message: `"${badEmail}" is not an email address. Put one address on each line.` });
  } else if (notifyEmails.length > SITE_LIMITS.notifyEmails) {
    errors.push({ field: "notifyEmails", message: `Please list at most ${SITE_LIMITS.notifyEmails} addresses.` });
  }

  const knownProblems = lines(values.knownProblems);
  if (knownProblems.length > SITE_LIMITS.knownProblems) {
    errors.push({ field: "knownProblems", message: `Please list at most ${SITE_LIMITS.knownProblems} problems.` });
  } else if (knownProblems.some((p) => p.length > SITE_LIMITS.knownProblem)) {
    errors.push({
      field: "knownProblems",
      message: `Please keep each problem under ${SITE_LIMITS.knownProblem} characters.`,
    });
  }

  const input =
    errors.length === 0 && website
      ? {
          organization: values.organization,
          website,
          contactEmail: values.contactEmail,
          replyDays,
          phone: values.phone,
          notifyEmails,
          knownProblems,
        }
      : null;
  return { values, input, errors };
}
