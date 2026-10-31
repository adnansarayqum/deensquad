"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { coachLimit, requireStaff } from "../auth/session";
import { UUID } from "../auth/tokens";
import { enqueue } from "../background";
import { appUrl } from "../config";
import { asSystem, asUser } from "../db";
import { canSendEmail, sendEmails } from "../email/send";
import { incidentAdminEmail } from "../email/templates";
import { runMessageNotices } from "../messages/run";
import { cleanBody } from "../validate";
import { INCIDENT_KINDS, INCIDENT_TEXT_MAX, isIncidentKind, logIncident, readLondonDateTime } from "./data";

export type IncidentFormState = { error?: string };

export async function saveIncident(_prev: IncidentFormState, formData: FormData): Promise<IncidentFormState> {
  const user = await requireStaff();
  const child = formData.get("child");
  if (typeof child !== "string" || !UUID.test(child)) return { error: "Choose the child." };
  const kind = formData.get("kind");
  if (!isIncidentKind(kind)) return { error: "Choose what kind of incident it was." };
  const happenedAt = readLondonDateTime(formData.get("happenedAt"));
  if (!happenedAt) return { error: "Say when it happened." };
  if (happenedAt.getTime() > Date.now() + 5 * 60_000) return { error: "That time is in the future. Check when it happened." };
  const rawWhat = String(formData.get("whatHappened") ?? "");
  const rawAction = String(formData.get("actionTaken") ?? "");
  if (rawWhat.length > INCIDENT_TEXT_MAX || rawAction.length > INCIDENT_TEXT_MAX) return { error: `Keep each box to ${INCIDENT_TEXT_MAX} characters.` };
  const whatHappened = cleanBody(rawWhat, INCIDENT_TEXT_MAX);
  const actionTaken = cleanBody(rawAction, INCIDENT_TEXT_MAX);
  if (!whatHappened) return { error: "Say what happened." };
  if (!actionTaken) return { error: "Say what you did about it (first aid, called the parent, rested)." };
  const session = formData.get("session");
  const sessionId = typeof session === "string" && UUID.test(session) ? session : null;
  if (formData.get("checked") !== "yes") return { error: "Tick the box to say you've checked it. It goes to the parents straight away and can't be changed." };
  if (sessionId) {
    // Opened from a session's register: the time has to be on that session's day (London), or it's the wrong session.
    const [s] = await asUser(user.id, (tx) =>
      tx.query<{ same: boolean; title: string }>(
        `select (starts_at at time zone 'Europe/London')::date = ($2::timestamptz at time zone 'Europe/London')::date as same, title from sessions where id = $1`,
        [sessionId, happenedAt],
      ),
    );
    if (s && !s.same) return { error: `That time isn't on the day of ${s.title}. Check when it happened.` };
  }

  const result = await asUser(user.id, (tx) =>
    logIncident(tx, { playerId: child, sessionId, kind, happenedAt, whatHappened, actionTaken, staff: { id: user.staff.id, displayName: user.staff.displayName } }, coachLimit(user.staff)),
  );
  if (!result) return { error: "You can log incidents for children in your own groups only." };
  const base = appUrl() ?? (process.env.NODE_ENV === "production" ? null : `http://${(await headers()).get("host")}`);
  after(() => enqueue("incident notify", () => runMessageNotices({ conversationId: result.conversationId })));
  after(() => enqueue("incident email", () => tellAdmins(child, INCIDENT_KINDS[kind], user.staff.displayName, base)));
  redirect(`/coach/incidents?logged=1`);
}

/** Emails each admin that an incident was logged (who and what kind; the details stay in the app). Never throws. */
async function tellAdmins(playerId: string, kind: string, by: string, base: string | null) {
  if (!canSendEmail()) return;
  const [child] = await asSystem((tx) => tx.query<{ first_name: string; last_name: string; age_group: string }>(`select first_name, last_name, age_group::text as age_group from players where id = $1`, [playerId]));
  const admins = await asSystem((tx) => tx.query<{ email: string }>(`select email from staff where role = 'admin'`));
  if (!child || admins.length === 0) return;
  const { failed } = await sendEmails(
    admins.map((a) =>
      incidentAdminEmail({
        to: a.email,
        childName: `${child.first_name} ${child.last_name[0] ?? ""}.`,
        group: child.age_group,
        kind,
        by,
        link: base ? `${base}/admin/families/${playerId}` : null,
        appUrl: base,
      }),
    ),
  );
  if (failed.length) console.error(`[incident] admin email not sent to ${failed.length} admin(s).`);
}
