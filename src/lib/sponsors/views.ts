import "server-only";
import { after } from "next/server";
import { asSystem } from "../db";
import type { Queryable } from "../db/types";

/** Where a sponsor can be shown and counted: Home's This week line, the checked-in line, the Our sponsors page. */
export type SponsorPlace = "home" | "gate" | "page";
export const PLACE_WORDS: Record<SponsorPlace, string> = { home: "Home", gate: "checked-in line", page: "sponsors page" };

/** Adds one to today's (London) total for each sponsor in a place. Totals only: nothing about who was looking. */
export async function addSponsorViews(tx: Queryable, sponsorIds: string[], place: SponsorPlace): Promise<void> {
  if (sponsorIds.length === 0) return;
  await tx.query(
    `insert into sponsor_views (sponsor_id, day, place, views)
     select s.id, (now() at time zone 'Europe/London')::date, $2, 1 from sponsors s where s.id = any($1::uuid[])
     on conflict (sponsor_id, day, place) do update set views = sponsor_views.views + 1`,
    [sponsorIds, place],
  );
}

/**
 * Counts a showing once the page has gone out, so it never slows the page or fails it. Runs as the app itself,
 * because parents can't write the totals (and must not be able to).
 */
export function countSponsorViews(sponsorIds: string[], place: SponsorPlace): void {
  if (sponsorIds.length === 0) return;
  // Not through the background queue: a count is never worth waiting behind a reminder run, or an alert email.
  after(() =>
    asSystem((tx) => addSponsorViews(tx, sponsorIds, place)).catch((error: unknown) => {
      console.warn("[sponsors] a view wasn't counted:", error instanceof Error ? error.message : error);
    }),
  );
}

export type SponsorViewTotals = Record<string, { total: number; byPlace: Partial<Record<SponsorPlace, number>> }>;

/** Times each sponsor was shown in the last `days` London days, by place (admins only, by RLS). */
export async function loadSponsorViews(tx: Queryable, days = 30): Promise<SponsorViewTotals> {
  const rows = await tx.query<{ sponsor_id: string; place: SponsorPlace; views: number }>(
    `select sponsor_id, place, sum(views)::int as views from sponsor_views
     where day > (now() at time zone 'Europe/London')::date - $1::int group by sponsor_id, place`,
    [days],
  );
  const out: SponsorViewTotals = {};
  for (const r of rows) {
    const entry = (out[r.sponsor_id] ??= { total: 0, byPlace: {} });
    entry.total += r.views;
    entry.byPlace[r.place] = r.views;
  }
  return out;
}

/** "412 views · 30 days", for the sponsor's closed row on the admin page. */
export function viewsShort(totals: SponsorViewTotals[string] | undefined, days = 30): string {
  const n = totals?.total ?? 0;
  return `${n === 1 ? "1 view" : `${n.toLocaleString("en-GB")} views`} · ${days} days`;
}

/** "Shown 412 times in the last 30 days: 380 on Home, 20 on the checked-in line, 12 on the sponsors page." */
export function viewsSentence(totals: SponsorViewTotals[string] | undefined, days = 30): string {
  if (!totals || totals.total === 0) return `Not shown yet in the last ${days} days.`;
  const parts = (["home", "gate", "page"] as const)
    .filter((p) => (totals.byPlace[p] ?? 0) > 0)
    .map((p) => `${totals.byPlace[p]} on ${p === "home" ? "Home" : `the ${PLACE_WORDS[p]}`}`);
  return `Shown ${totals.total === 1 ? "once" : `${totals.total.toLocaleString("en-GB")} times`} in the last ${days} days: ${parts.join(", ")}.`;
}
