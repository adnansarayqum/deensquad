"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { isGroupCoach, requireStaff, staffGroups } from "../auth/session";
import { UUID } from "../auth/tokens";
import { asUser } from "../db";
import { isAgeGroup } from "../domain";
import { readUpload, saveFile } from "../files";
import { cleanBody, cleanText } from "../validate";
import { runPlanNotifications } from "./run";

export type PlanState = { error?: string; saved?: boolean };

/** Writes (or replaces) a group's plan for a session: text, an attachment, or both. */
export async function savePlan(_prev: PlanState, formData: FormData): Promise<PlanState> {
  const user = await requireStaff();
  const session = formData.get("session");
  const group = formData.get("group");
  if (typeof session !== "string" || !UUID.test(session) || !isAgeGroup(group)) return { error: "Something went wrong. Reload and try again." };
  if (!staffGroups(user.staff).includes(group)) return { error: "You can add plans for your own groups only." };
  const body = cleanBody(formData.get("body"), 4000);
  const file = await readUpload(formData.get("file"));
  if (!file.ok) return { error: file.error };
  const removeFile = formData.get("removeFile") === "on";

  const error = await asUser(user.id, async (tx) => {
    const [s] = await tx.query(`select 1 from sessions where id = $1 and $2::age_group = any (age_groups)`, [session, group]);
    if (!s) return "That session isn't for this group.";
    const [existing] = await tx.query<{ file_id: string | null }>(`select file_id from session_plans where session_id = $1 and age_group = $2::age_group`, [
      session,
      group,
    ]);
    const fileId = file.upload ? await saveFile(tx, file.upload, user.staff.id) : removeFile ? null : (existing?.file_id ?? null);
    if (!body && !fileId) return "Write the plan or attach a file.";
    await tx.query(
      `insert into session_plans (session_id, age_group, body, file_id, author) values ($1, $2::age_group, $3, $4, $5)
       on conflict (session_id, age_group) do update set body = excluded.body, file_id = excluded.file_id, author = excluded.author, updated_at = now()`,
      [session, group, body, fileId, user.staff.id],
    );
    if (existing?.file_id && existing.file_id !== fileId) await tx.query(`delete from club_files where id = $1`, [existing.file_id]);
    return null;
  });
  if (error) return { error };
  await runPlanNotifications();
  refresh();
  return { saved: true };
}

export async function deletePlan(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const id = formData.get("plan");
  if (typeof id !== "string" || !UUID.test(id)) return;
  await asUser(user.id, async (tx) => {
    const [plan] = await tx.query<{ file_id: string | null }>(
      `delete from session_plans where id = $1 and age_group::text = any ($2::text[]) returning file_id`,
      [id, staffGroups(user.staff)],
    );
    if (plan?.file_id) await tx.query(`delete from club_files where id = $1`, [plan.file_id]);
  });
  redirect("/coach/plans");
}

export async function addPracticeSheet(_prev: PlanState, formData: FormData): Promise<PlanState> {
  const user = await requireStaff();
  const title = cleanText(formData.get("title"), 120);
  const body = cleanBody(formData.get("body"), 4000);
  const mine = staffGroups(user.staff);
  const groups = formData.getAll("groups").filter(isAgeGroup);
  const file = await readUpload(formData.get("file"));
  if (!title) return { error: "Give it a title, like Keepy-uppy challenge." };
  if (!file.ok) return { error: file.error };
  if (!body && !file.upload) return { error: "Write the instructions or attach a sheet." };
  if (groups.some((g) => !mine.includes(g))) return { error: `You can post to your own groups: ${mine.join(", ")}.` };
  if (isGroupCoach(user.staff) && groups.length === 0) return { error: "Choose which of your groups it's for." };
  await asUser(user.id, async (tx) => {
    const fileId = file.upload ? await saveFile(tx, file.upload, user.staff.id) : null;
    await tx.query(`insert into practice_sheets (title, body, age_groups, file_id, posted_by) values ($1, $2, $3::text[]::age_group[], $4, $5)`, [
      title,
      body,
      groups,
      fileId,
      user.staff.id,
    ]);
  });
  await runPlanNotifications();
  refresh();
  return { saved: true };
}

export async function deletePracticeSheet(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const id = formData.get("sheet");
  if (typeof id !== "string" || !UUID.test(id)) return;
  await asUser(user.id, async (tx) => {
    // Admins can remove any sheet; coaches the ones they posted.
    const [sheet] = await tx.query<{ file_id: string | null }>(`delete from practice_sheets where id = $1 and ($2 or posted_by = $3) returning file_id`, [
      id,
      user.staff.role === "admin",
      user.staff.id,
    ]);
    if (sheet?.file_id) await tx.query(`delete from club_files where id = $1`, [sheet.file_id]);
  });
  refresh();
}
