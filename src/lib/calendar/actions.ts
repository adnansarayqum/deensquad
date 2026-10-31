"use server";

import { headers } from "next/headers";
import { requireParent } from "../auth/session";
import { appUrl } from "../config";
import { asUser } from "../db";
import { addMyCalendarLink, calendarLinks, MAX_CALENDAR_LINKS, setMyCalendarToken, stopMyCalendarLinks } from "./feed";

export type CalendarLinkResult = { links?: ReturnType<typeof calendarLinks>; stopped?: boolean; error?: string } | null;

/**
 * Player → Calendar. "Get my calendar link" (the first), "Get a link for another phone" (one more, leaving the others
 * working) and "Stop all calendar links" (every link stops updating; needs the ticked box). Only hashes are stored, so
 * a new link is shown this once, in the result.
 */
export async function makeCalendarLink(_prev: CalendarLinkResult, formData: FormData): Promise<CalendarLinkResult> {
  const user = await requireParent();
  const intent = formData.get("intent");
  if (intent === "stop") {
    if (formData.get("confirm") !== "yes") return { error: "Tick the box to stop every calendar link." };
    await asUser(user.id, stopMyCalendarLinks);
    return { stopped: true };
  }
  let base = appUrl();
  if (!base && process.env.NODE_ENV !== "production") {
    const host = (await headers()).get("host");
    base = host ? `http://${host}` : null;
  }
  if (!base) return { error: "Calendar links aren't set up yet. Ask the club." };
  if (intent === "another") {
    const token = await asUser(user.id, addMyCalendarLink);
    if (!token) return { error: `You have ${MAX_CALENDAR_LINKS} calendar links already. Stop them all, then start again with the phones you use.` };
    return { links: calendarLinks(base, token) };
  }
  const token = await asUser(user.id, setMyCalendarToken);
  return { links: calendarLinks(base, token) };
}
