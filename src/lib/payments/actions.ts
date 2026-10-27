"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "../auth/session";
import { asUser } from "../db";
import { applyTeamFeePay, parseTeamFeePay, planTeamFeePay, type TfpChange, type TfpSkip } from "./teamfeepay";

export type TfpState = {
  stage: "start" | "preview" | "done";
  csv?: string;
  error?: string;
  changes?: TfpChange[];
  unchanged?: number;
  skipped?: TfpSkip[];
  applied?: number;
};

const MAX_BYTES = 1_000_000;

/** Admin → Families → TeamFeePay: upload the export, see what it would change, then apply it. */
export async function importTeamFeePay(_prev: TfpState, formData: FormData): Promise<TfpState> {
  const user = await requireAdmin();
  let csv = typeof formData.get("csv") === "string" ? (formData.get("csv") as string) : "";
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return { stage: "start", error: "That file is too big (over 1 MB)." };
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") return { stage: "start", error: "Upload the export as a .csv file. In Excel, use File > Save as > CSV." };
    csv = await file.text();
  }
  if (!csv.trim()) return { stage: "start", error: "Choose the CSV file you exported from TeamFeePay." };
  if (csv.length > MAX_BYTES) return { stage: "start", error: "That file is too big (over 1 MB)." };

  const parsed = parseTeamFeePay(csv);
  if (parsed.problem) return { stage: "start", error: parsed.problem };
  const plan = await asUser(user.id, (tx) => planTeamFeePay(tx, parsed.rows));

  if (formData.get("intent") === "apply") {
    const applied = await asUser(user.id, (tx) => applyTeamFeePay(tx, plan.changes, new Date()));
    refresh();
    return { stage: "done", applied, unchanged: plan.unchanged, skipped: plan.skipped };
  }
  return { stage: "preview", csv, changes: plan.changes, unchanged: plan.unchanged, skipped: plan.skipped };
}
