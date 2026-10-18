"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "../auth/session";
import { asUser } from "../db";
import { parseFee, setSessionFeePence } from "../settings";

/** Admin → Sessions: the fee taken at the gate from pay-as-you-go families and trial children. */
export async function saveSessionFee(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const pence = parseFee(formData.get("fee"));
  if (!pence) redirect("/admin/sessions?fee=invalid#session-fee");
  await asUser(user.id, (tx) => setSessionFeePence(tx, pence, user.staff.id));
  redirect("/admin/sessions?fee=saved#session-fee");
}
