// The People page: who can log in, adding people with an invitation, changing what
// they can see, and removing them. Only portal owners can use it.

import { AdminLayout } from "./admin.js";
import type { PeopleEvent, Person, Site } from "./db.js";
import { formatTime } from "./timeline.js";
import { isEmail } from "./validate.js";

function host(website: string): string {
  try {
    return new URL(website).host;
  } catch {
    return website;
  }
}

export interface AccessChoice {
  allSites: boolean;
  siteIds: string[];
}

/** In plain words: what a person can see. */
export function describeAccess(access: AccessChoice, sites: Site[]): string {
  if (access.allSites) return "All websites";
  const names = sites.filter((s) => access.siteIds.includes(s.id)).map((s) => host(s.website));
  return names.length ? `Only ${names.join(", ")}` : "No websites";
}

export function personAccess(person: Person): AccessChoice {
  return { allSites: person.all_sites === 1, siteIds: person.site_ids ? person.site_ids.split(",") : [] };
}

type FormValue = string | File | (string | File)[] | undefined;

export interface PersonFormError {
  field: "email" | "access";
  message: string;
}

/** Checks the "Add a person" / "Change access" form. Only real website ids are kept. */
export function parsePersonForm(
  form: Record<string, FormValue>,
  sites: Site[],
  needsEmail: boolean,
): { email: string; access: AccessChoice; errors: PersonFormError[] } {
  const first = (v: FormValue) => (typeof (Array.isArray(v) ? v[0] : v) === "string" ? String(Array.isArray(v) ? v[0] : v) : "");
  const email = first(form.email).trim().toLowerCase();
  const allSites = first(form.access) !== "some";
  const ticked = (Array.isArray(form.sites) ? form.sites : form.sites === undefined ? [] : [form.sites]).filter(
    (v): v is string => typeof v === "string",
  );
  const siteIds = [...new Set(ticked)].filter((id) => sites.some((s) => s.id === id));
  const errors: PersonFormError[] = [];
  if (needsEmail && !isEmail(email)) {
    errors.push({ field: "email", message: "Please type their email address, like name@example.com" });
  }
  if (!allSites && siteIds.length === 0) {
    errors.push({ field: "access", message: "Please tick at least one website, or choose All websites." });
  }
  return { email, access: { allSites, siteIds: allSites ? [] : siteIds }, errors };
}

function ErrorSummary(props: { errors: PersonFormError[] }) {
  if (props.errors.length === 0) return null;
  return (
    <div class="error-summary" tabindex={-1} autofocus aria-labelledby="error-summary-title">
      <h2 id="error-summary-title">
        Please fix {props.errors.length} thing{props.errors.length === 1 ? "" : "s"}
      </h2>
      <ul>
        {props.errors.map((e) => (
          <li>
            <a href={e.field === "email" ? "#person-email" : "#access-all"}>{e.message}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AccessFields(props: { sites: Site[]; access: AccessChoice; error?: PersonFormError }) {
  const { sites, access, error } = props;
  return (
    <fieldset aria-describedby={error ? "access-error" : undefined}>
      <legend>What can they see?</legend>
      {error && (
        <p id="access-error" class="error-message">
          Error: {error.message}
        </p>
      )}
      <div class="choice">
        <input type="radio" id="access-all" name="access" value="all" checked={access.allSites} />
        <label for="access-all">All websites, and they can add websites</label>
      </div>
      <div class="choice">
        <input type="radio" id="access-some" name="access" value="some" checked={!access.allSites} />
        <label for="access-some">Only the websites I tick below</label>
      </div>
      {sites.length > 0 ? (
        <fieldset class="nested">
          <legend>Websites (used with "Only the websites I tick")</legend>
          {sites.map((s) => (
            <div class="choice">
              <input
                type="checkbox"
                id={`site-${s.id}`}
                name="sites"
                value={s.id}
                checked={!access.allSites && access.siteIds.includes(s.id)}
              />
              <label for={`site-${s.id}`}>
                {host(s.website)} ({s.organization})
              </label>
            </div>
          ))}
        </fieldset>
      ) : (
        <p class="hint">You haven't added any websites yet.</p>
      )}
    </fieldset>
  );
}

function describeEvent(e: PeopleEvent): string {
  if (e.kind === "added") return `${e.actor} added ${e.email} (${e.detail ?? "access not recorded"})`;
  if (e.kind === "removed") return `${e.actor} removed ${e.email}`;
  return `${e.actor} changed what ${e.email} can see: ${e.detail ?? ""}`;
}

export function PeoplePage(props: {
  email: string;
  owners: string[];
  people: Person[];
  sites: Site[];
  events: PeopleEvent[];
  timeZone: string;
  notice?: string;
  form?: { email: string; access: AccessChoice; errors: PersonFormError[] };
}) {
  const form = props.form ?? { email: "", access: { allSites: true, siteIds: [] }, errors: [] };
  const emailError = form.errors.find((e) => e.field === "email");
  return (
    <AdminLayout title={`${form.errors.length ? "Error: " : ""}People`} email={props.email} section="people" sectionHome>
      <div class="narrow">
        <ErrorSummary errors={form.errors} />
        {props.notice && (
          <div class="saved" tabindex={-1} autofocus>
            <p>{props.notice}</p>
          </div>
        )}
        <h1>People</h1>
        <p class="lead">Who can log in to this portal, and what each person can see.</p>

        <div class="card">
          <h2>Portal owners</h2>
          <p>
            Owners can do everything, including adding and removing people. They're set in Cloudflare (ADMIN_EMAILS), so
            nobody can remove them from here by accident.
          </p>
          <ul>
            {props.owners.map((o) => (
              <li>{o}</li>
            ))}
          </ul>
        </div>

        <div class="card">
          <h2>People you've added</h2>
          {props.people.length === 0 ? (
            <p>Nobody yet. Add someone below.</p>
          ) : (
            <div class="table-scroll" role="region" aria-label="People you've added" tabindex={0}>
              <table>
                <caption class="visually-hidden">People you've added</caption>
                <thead>
                  <tr>
                    <th scope="col">Email</th>
                    <th scope="col">Can see</th>
                    <th scope="col">Added</th>
                    <th scope="col">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {props.people.map((p) => (
                    <tr>
                      <td>{p.email}</td>
                      <td>{describeAccess(personAccess(p), props.sites)}</td>
                      <td>
                        {formatTime(p.added_at, props.timeZone)} by {p.added_by}
                      </td>
                      <td>
                        <a href={`/admin/people/${encodeURIComponent(p.email)}`}>
                          Change access<span class="visually-hidden"> for {p.email}</span>
                        </a>
                        <br />
                        <a href={`/admin/people/${encodeURIComponent(p.email)}/remove`}>
                          Remove<span class="visually-hidden"> {p.email}</span>
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <form method="post" action="/admin/people" class="card" novalidate>
          <h2>Add a person</h2>
          <div class="field">
            <label for="person-email">Their email address</label>
            <p id="person-email-hint" class="hint">
              We'll email them an invitation. They log in with a one-time link, so there's no password.
            </p>
            {emailError && (
              <p id="person-email-error" class="error-message">
                Error: {emailError.message}
              </p>
            )}
            <input
              type="email"
              id="person-email"
              name="email"
              value={form.email}
              autocomplete="off"
              aria-invalid={emailError ? "true" : undefined}
              aria-describedby={emailError ? "person-email-hint person-email-error" : "person-email-hint"}
            />
          </div>
          <AccessFields sites={props.sites} access={form.access} error={form.errors.find((e) => e.field === "access")} />
          <button type="submit">Add and send invitation</button>
        </form>

        {props.events.length > 0 && (
          <div class="card">
            <h2>History</h2>
            <ul>
              {props.events.map((e) => (
                <li>
                  <time datetime={e.at}>{formatTime(e.at, props.timeZone)}</time>: {describeEvent(e)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

export function EditPersonPage(props: {
  email: string;
  person: Person;
  sites: Site[];
  access: AccessChoice;
  errors: PersonFormError[];
}) {
  const { person } = props;
  return (
    <AdminLayout title={`${props.errors.length ? "Error: " : ""}What ${person.email} can see`} email={props.email} section="people">
      <div class="narrow">
        <ErrorSummary errors={props.errors} />
        <p>
          <a href="/admin/people">Back to People</a>
        </p>
        <h1>What {person.email} can see</h1>
        <form method="post" action={`/admin/people/${encodeURIComponent(person.email)}`} class="card">
          <AccessFields sites={props.sites} access={props.access} error={props.errors.find((e) => e.field === "access")} />
          <button type="submit">Save</button>
        </form>
      </div>
    </AdminLayout>
  );
}

export function RemovePersonPage(props: { email: string; person: Person }) {
  const { person } = props;
  return (
    <AdminLayout title={`Remove ${person.email}?`} email={props.email} section="people">
      <div class="card warning narrow">
        <h1>Remove {person.email}?</h1>
        <p>
          They'll be logged out straight away and won't be able to log in again. Their notes and changes stay in each
          report's timeline. You can add them again later.
        </p>
        <form method="post" action={`/admin/people/${encodeURIComponent(person.email)}/remove`}>
          <button type="submit" class="danger">
            Yes, remove them
          </button>
        </form>
        <p>
          <a href="/admin/people">No, go back</a>
        </p>
      </div>
    </AdminLayout>
  );
}
