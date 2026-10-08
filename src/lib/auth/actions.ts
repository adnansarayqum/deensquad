"use server";

import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { sendErrorAlert } from "../alerts";
import { adminEmails, appUrl } from "../config";
import { asSystem } from "../db";
import { canSendEmail, sendEmails } from "../email/send";
import { newFamilyEmail, signInEmail } from "../email/templates";
import { PENDING_COOKIE, SESSION_COOKIE, cookieOptions, safeNext } from "./cookies";
import { clientIpFrom } from "./ip";
import { readPending, type Pending } from "./pending";
import { parseRegistration, type Registered } from "./registration";
import {
  LIMITS,
  SESSION_DAYS,
  SIGN_IN_MINUTES,
  createSession,
  deleteSession,
  dropUnsentRequest,
  ensureBootstrapAdmin,
  issueSignIn,
  latestOpenRequest,
  verifyCode,
  verifyLink,
} from "./service";
import { cleanCode, maskEmail, normaliseEmail } from "./tokens";

export type FormState = { error?: string };


async function clientIp(): Promise<string | null> {
  return clientIpFrom(await headers());
}

/** Where links in emails point. In development, the address the browser used. */
async function baseUrl(): Promise<string | null> {
  const configured = appUrl();
  if (configured || process.env.NODE_ENV === "production") return configured;
  const h = await headers();
  return h.get("host") ? `http://${h.get("host")}` : null;
}

export async function requestCode(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = normaliseEmail(formData.get("email"));
  if (!email) return { error: "Enter the email address you gave the club, like name@example.com." };
  const next = safeNext(formData.get("next"));

  const now = new Date();
  const result = await asSystem(async (tx) => {
    await ensureBootstrapAdmin(tx, email, adminEmails());
    return issueSignIn(tx, { email, ip: await clientIp(), now, purpose: "sign_in" });
  });

  // The per-address limit applies to everyone alike, so saying so gives nothing away.
  if (!result.ok && result.reason === "rate_limited" && result.limit === "ip") {
    return { error: "That's a lot of codes in one hour. Wait a little while, then try again." };
  }

  // For an address the club doesn't have, or one that has had its hour's codes, show the same screen without
  // sending anything, so the sign-in page can't be used to find out who is a member. The code screen says the
  // latest code still works, so for a known address it's wired to the newest code still open (if any).
  let pending: Pending = { id: randomUUID(), to: maskEmail(email), next };
  if (!result.ok && result.reason === "rate_limited") {
    const latest = await asSystem((tx) => latestOpenRequest(tx, email, now));
    if (latest) pending = { id: latest, to: maskEmail(email), next };
  }
  if (result.ok) {
    const { requestId, code, token } = result.request;
    const base = await baseUrl();
    const { failed } = await sendEmails([signInEmail({ to: email, code: code!, link: base ? `${base}/sign-in/link?token=${token}` : null, appUrl: base })]);
    if (failed.length) {
      // The code never reached them: forget it, so this try doesn't count towards the hour's codes.
      await asSystem((tx) => dropUnsentRequest(tx, requestId));
      return { error: "We couldn't send the email just now. Try again in a minute." };
    }
    pending = { id: requestId, to: maskEmail(email), next };
  }

  (await cookies()).set(PENDING_COOKIE, JSON.stringify(pending), cookieOptions(SIGN_IN_MINUTES * 60));
  redirect("/sign-in/code");
}

/** A new family signing itself up: we email a code, and the family is created once it's entered. */
export async function register(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = normaliseEmail(formData.get("email"));
  if (!email) return { error: "Enter your email address, like name@example.com." };
  const check = parseRegistration(formData);
  if (!check.ok) return { error: check.error };

  const ip = await clientIp();
  const result = await asSystem((tx) => issueSignIn(tx, { email, ip, now: new Date(), purpose: "sign_in", registration: check.registration }));
  if (!result.ok) {
    if (result.reason === "rate_limited" && result.limit === "club") {
      await sendErrorAlert({ message: `Sign-ups paused: more than ${LIMITS.signUpsPerHour} in the past hour across the club.`, path: "/sign-up", kind: "action" });
    }
    return { error: "That's a lot of codes in one hour. Wait a little while, then try again." };
  }
  const { requestId, code, token } = result.request;
  const base = await baseUrl();
  const { failed } = await sendEmails([signInEmail({ to: email, code: code!, link: base ? `${base}/sign-in/link?token=${token}` : null, appUrl: base })]);
  if (failed.length) {
    await asSystem((tx) => dropUnsentRequest(tx, requestId));
    return { error: "We couldn't send the email just now. Try again in a minute." };
  }
  const pending: Pending = { id: requestId, to: maskEmail(email), next: "/checklist", signUp: true };
  (await cookies()).set(PENDING_COOKIE, JSON.stringify(pending), cookieOptions(SIGN_IN_MINUTES * 60));
  redirect("/sign-in/code");
}

/** Tells the club's admins about a family that has just signed itself up. Never blocks sign-in. */
async function tellClub(email: string, registered: Registered | undefined) {
  if (!registered?.added.length || !canSendEmail()) return;
  try {
    const base = await baseUrl();
    const admins = await asSystem((tx) => tx.query<{ email: string }>(`select email from staff where role = 'admin'`));
    const { failed } = await sendEmails(
      admins.map((a) =>
        newFamilyEmail({
          to: a.email,
          parentName: registered.parentName,
          parentEmail: email,
          children: registered.added.map((c) => `${c.firstName} ${c.lastName} (${c.ageGroup})`),
          link: base ? `${base}/admin/families` : null,
          appUrl: base,
        }),
      ),
    );
    if (failed.length) console.error(`[sign-up] club email not sent to ${failed.length} admin(s).`);
  } catch (error) {
    console.error("[sign-up] club email failed:", error instanceof Error ? error.message : error);
  }
}

async function startSession(userId: string) {
  const token = await asSystem((tx) => createSession(tx, userId, new Date()));
  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(SESSION_DAYS * 86400));
  store.delete(PENDING_COOKIE);
}

export async function submitCode(_prev: FormState, formData: FormData): Promise<FormState> {
  const pending = await readPending();
  if (!pending) return { error: "This code screen has timed out. Ask for a new code." };
  const code = cleanCode(formData.get("code"));
  if (!code) return { error: "Enter the 6 digits from the email." };

  const result = await asSystem((tx) => verifyCode(tx, pending.id, code, new Date()));
  if (!result.ok) {
    switch (result.reason) {
      case "wrong":
        return {
          error: result.attemptsLeft
            ? `That code doesn't match. ${result.attemptsLeft === 1 ? "One more try" : `${result.attemptsLeft} more tries`}, then you'll need a new code.`
            : "That code doesn't match. Check the newest email from Deen Squad.",
        };
      case "too_many":
        return { error: "Too many wrong codes. Ask for a new one." };
      case "locked":
        return { error: "Too many wrong codes today. Tap the link in the email instead, or try again tomorrow." };
      case "expired":
        return { error: "That code has expired. Ask for a new one." };
      case "used":
        return { error: "That code has already been used. Ask for a new one." };
    }
  }
  await startSession(result.userId);
  await tellClub(result.email, result.registered);
  redirect(pending.next);
}

export async function submitLink(formData: FormData): Promise<void> {
  const token = formData.get("token");
  if (typeof token !== "string" || token.length < 20) redirect("/sign-in");
  const result = await asSystem((tx) => verifyLink(tx, token, new Date()));
  if (!result.ok) redirect("/sign-in?link=expired");
  await startSession(result.userId);
  await tellClub(result.email, result.registered);
  redirect(result.registered ? "/checklist" : "/");
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await asSystem((tx) => deleteSession(tx, token));
  store.delete(SESSION_COOKIE);
  redirect("/sign-in");
}
