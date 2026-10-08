"use server";

import { headers } from "next/headers";
import { requireParent } from "../auth/session";
import { appUrl } from "../config";
import { asUser } from "../db";
import { calendarLinks, setMyCalendarToken } from "./feed";

export type CalendarLinkResult = { links?: ReturnType<typeof calendarLinks>; error?: string } | null;

/**
 * "Get my calendar link" and "Reset link" (Player → Calendar): makes a new token, replacing any old one (whose link
 * then 404s), and returns the links. Only the hash is stored, so this is the one time the link can be shown.
 */
export async function makeCalendarLink(): Promise<CalendarLinkResult> {
  const user = await requireParent();
  let base = appUrl();
  if (!base && process.env.NODE_ENV !== "production") {
    const host = (await headers()).get("host");
    base = host ? `http://${host}` : null;
  }
  if (!base) return { error: "Calendar links aren't set up yet. Ask the club." };
  const token = await asUser(user.id, setMyCalendarToken);
  return { links: calendarLinks(base, token) };
}
