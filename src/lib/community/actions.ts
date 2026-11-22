"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "../auth/session";
import { UUID } from "../auth/tokens";
import { londonDate, londonIsoDate, londonTime } from "../dates";
import { asUser } from "../db";
import { readLondonDateTime } from "../incidents/data";
import { cleanSponsorLink } from "../sponsors/data";
import { cleanBody, cleanText } from "../validate";
import { isAudience } from "./events";

export type CommunityFormState = { error?: string; saved?: boolean; message?: string };

/** Adds an event to What's on or saves changes to one (admins only). Times are typed in London time. */
export async function saveEvent(_prev: CommunityFormState, formData: FormData): Promise<CommunityFormState> {
  const user = await requireAdmin();
  const id = formData.get("id");
  const title = cleanText(formData.get("title"), 80);
  const audience = formData.get("audience");
  const startsAt = readLondonDateTime(formData.get("startsAt"));
  const finish = String(formData.get("finishes") ?? "").trim();
  const until = String(formData.get("repeatUntil") ?? "").trim();
  const weekly = formData.get("weekly") === "on";
  const linkText = String(formData.get("link") ?? "").trim();
  const link = linkText ? cleanSponsorLink(linkText) : null;
  if (!title) return { error: "Give the event a name, like Brothers' football." };
  if (!isAudience(audience)) return { error: "Choose who it's for." };
  if (!startsAt) return { error: "Add the day and the time it starts." };
  let endsAt: Date | null = null;
  if (finish) {
    const m = /^(\d{2}):(\d{2})$/.exec(finish);
    const day = londonDate(startsAt);
    endsAt = m ? londonTime(day.year, day.month, day.day, Number(m[1]), Number(m[2])) : null;
    if (!endsAt || endsAt <= startsAt) return { error: "The finish time should be later the same day than the start." };
  }
  if (until && (!/^\d{4}-\d{2}-\d{2}$/.test(until) || Number.isNaN(Date.parse(`${until}T00:00:00Z`)))) {
    return { error: "The last date should be a day, like 2027-03-25." };
  }
  if (weekly && until && until < londonIsoDate(startsAt)) return { error: "The last date should be on or after the first day." };
  if (linkText && !link) return { error: "The link should be a full address starting with https://" };

  const values = [
    title,
    audience,
    startsAt,
    endsAt,
    weekly,
    weekly && until ? until : null,
    cleanText(formData.get("venue"), 120),
    cleanBody(formData.get("details"), 1000),
    cleanText(formData.get("howToJoin"), 300),
    link,
    formData.get("active") === "on",
  ];
  const saved = await asUser(user.id, async (tx) => {
    const existing = typeof id === "string" && UUID.test(id) ? id : null;
    const rows = existing
      ? await tx.query(
          `update community_events set title = $2, audience = $3, starts_at = $4, ends_at = $5, weekly = $6, repeat_until = $7::date, venue = $8,
             details = $9, how_to_join = $10, link_url = $11, active = $12
           where id = $1 returning id`,
          [existing, ...values],
        )
      : await tx.query(
          `insert into community_events (title, audience, starts_at, ends_at, weekly, repeat_until, venue, details, how_to_join, link_url, active, created_by)
           values ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10, $11, $12) returning id`,
          [...values, user.staff.id],
        );
    return rows.length === 1;
  });
  if (!saved) return { error: "That event isn't there any more. Reload the page." };
  refresh();
  return { saved: true };
}

/** Takes an event off for good (admins only; the form's "Yes" box must be ticked). */
export async function removeEvent(_prev: CommunityFormState, formData: FormData): Promise<CommunityFormState> {
  const user = await requireAdmin();
  const id = formData.get("id");
  if (typeof id !== "string" || !UUID.test(id)) return { error: "That event isn't there any more. Reload the page." };
  if (formData.get("confirm") !== "yes") return { error: "Tick the box to remove this event." };
  await asUser(user.id, (tx) => tx.query(`delete from community_events where id = $1`, [id]));
  refresh();
  return { saved: true, message: "Event removed." };
}

/** Puts a practice sheet into Coach's corner, or takes it out (admins only). */
export async function setSheetCommunity(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = formData.get("sheet");
  if (typeof id !== "string" || !UUID.test(id)) return;
  await asUser(user.id, (tx) => tx.query(`update practice_sheets set community = $2 where id = $1`, [id, formData.get("share") === "yes"]));
  refresh();
}
