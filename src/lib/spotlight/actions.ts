"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { requireStaff, staffGroups } from "../auth/session";
import { UUID } from "../auth/tokens";
import { enqueue } from "../background";
import { asUser } from "../db";
import { cleanText } from "../validate";
import { COMMENT_MAX, loadSpotlight, removeSpotlight, setSpotlight, weekStart } from "./data";
import { runSpotlightNotices } from "./notify";

export type SpotlightState = { error?: string; saved?: boolean };

const RELOAD = "Something went wrong. Reload and try again.";

/** A coach (their own groups) or admin makes a child this week's Player of the week for their group. */
export async function makePlayerOfTheWeek(_prev: SpotlightState, formData: FormData): Promise<SpotlightState> {
  const user = await requireStaff();
  const player = formData.get("player");
  if (typeof player !== "string" || !UUID.test(player)) return { error: RELOAD };
  const comment = cleanText(formData.get("comment"), COMMENT_MAX + 1);
  if (!comment) return { error: "Write a line about why. Parents see it on the card." };
  if (comment.length > COMMENT_MAX) return { error: `Keep it to ${COMMENT_MAX} characters.` };
  const result = await asUser(user.id, async (tx) => {
    const mine = await tx.query(`select 1 from players where id = $1 and age_group::text = any ($2::text[])`, [player, staffGroups(user.staff)]);
    if (!mine.length) return "You can choose a Player of the week in your own groups only.";
    return (await setSpotlight(tx, { playerId: player, comment, staffId: user.staff.id, week: weekStart(new Date()) })) ? null : RELOAD;
  });
  if (result) return { error: result };
  after(() => enqueue("spotlight notices", () => runSpotlightNotices().then(() => undefined)));
  refresh();
  return { saved: true };
}

/** Takes a Player of the week back (a slip): the coach who gave it within their groups, or an admin. */
export async function removePlayerOfTheWeek(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const id = formData.get("spotlight");
  if (typeof id !== "string" || !UUID.test(id) || formData.get("confirm") !== "yes") return;
  await asUser(user.id, async (tx) => {
    const found = await loadSpotlight(tx, id);
    if (!found || !staffGroups(user.staff).includes(found.ageGroup)) return;
    await removeSpotlight(tx, id);
  });
  refresh();
}
