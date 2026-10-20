// Who can log in, and what each person can see.
//
// - Portal owners are the emails in ADMIN_EMAILS (set in Cloudflare). They can do
//   everything, including managing people, and can't be removed from inside the portal,
//   so nobody can lock everyone out.
// - People added on the People page see either every website, or only chosen websites.
//   A person limited to some websites can't see, change, download or delete anything
//   belonging to any other website.

import { createContext } from "hono/jsx";
import { adminEmails } from "./auth.js";
import { isEmail } from "./validate.js";

export interface Viewer {
  email: string;
  /** In ADMIN_EMAILS: can do everything, including managing people. */
  owner: boolean;
  /** Can see every website (owners always can). */
  allSites: boolean;
  /** The websites a limited person can see. Empty when allSites is true. */
  siteIds: string[];
}

/** The logged-in person, for the page menu. Set around each owner page. */
export const ViewerContext = createContext<Viewer | null>(null);

/** What this email address can do, or null if it can't log in at all. */
export async function getViewer(db: D1Database, adminSetting: string | undefined, email: string): Promise<Viewer | null> {
  const address = email.trim().toLowerCase();
  if (adminEmails(adminSetting).includes(address)) {
    return { email: address, owner: true, allSites: true, siteIds: [] };
  }
  const person = await db.prepare("SELECT all_sites FROM people WHERE email = ?").bind(address).first<{ all_sites: number }>();
  if (!person) return null;
  if (person.all_sites) return { email: address, owner: false, allSites: true, siteIds: [] };
  const sites = await db
    .prepare("SELECT site_id FROM person_sites WHERE email = ? ORDER BY site_id")
    .bind(address)
    .all<{ site_id: string }>();
  return { email: address, owner: false, allSites: false, siteIds: sites.results.map((s) => s.site_id) };
}

export async function canLogIn(db: D1Database, adminSetting: string | undefined, email: string): Promise<boolean> {
  return isEmail(email) && (await getViewer(db, adminSetting, email)) !== null;
}

export function canSeeSite(viewer: Viewer, siteId: string): boolean {
  return viewer.allSites || viewer.siteIds.includes(siteId);
}

/** Adding and deleting websites, and "Check my setup": everyone who sees every website. */
export function canManageWebsites(viewer: Viewer): boolean {
  return viewer.allSites;
}

/** Only portal owners manage people. */
export function canManagePeople(viewer: Viewer): boolean {
  return viewer.owner;
}

/** The websites a viewer can see, from a full list. */
export function visibleSites<T extends { id: string }>(viewer: Viewer, sites: T[]): T[] {
  return viewer.allSites ? sites : sites.filter((s) => viewer.siteIds.includes(s.id));
}
