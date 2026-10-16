// Turns timeline entries and times into plain English.

export const STATUSES = { new: "New", in_progress: "In progress", fixed: "Fixed" } as const;
export type Status = keyof typeof STATUSES;

export function isStatus(value: unknown): value is Status {
  return typeof value === "string" && Object.hasOwn(STATUSES, value);
}

export interface TimelineEvent {
  at: string;
  kind: string;
  detail: string | null;
  actor: string | null;
}

/** e.g. "Oct 16, 2026, 4:44 PM EDT" in the portal's time zone. */
export function formatTime(at: string | Date, timeZone: string): string {
  const date = typeof at === "string" ? new Date(at) : at;
  try {
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
      timeZoneName: "short",
    });
  } catch {
    // An unknown time zone in the settings shouldn't break the page.
    return formatTime(date, "UTC");
  }
}

export function describeEvent(event: TimelineEvent): string {
  const who = event.actor ?? "Someone";
  switch (event.kind) {
    case "received":
      return "Report received";
    case "owner_notified":
      return `Owner notified (${(event.detail ?? "").replace(/^Sent to /, "")})`;
    case "auto_reply_sent":
      return "Auto-reply sent to visitor";
    case "auto_reply_skipped":
      return `No auto-reply: ${event.detail ?? ""}`;
    case "email_failed":
      return `Email problem: ${event.detail ?? ""}`;
    case "emails_not_set_up":
      return "No emails sent: email is not set up yet";
    case "status_changed": {
      const [from, to] = (event.detail ?? "").split(">");
      const label = (s: string) => (isStatus(s) ? STATUSES[s] : s);
      return `${who} changed the status from ${label(from)} to ${label(to)}`;
    }
    case "note":
      return `${who} added a note: "${event.detail ?? ""}"`;
    default:
      return event.detail ? `${event.kind}: ${event.detail}` : event.kind;
  }
}
