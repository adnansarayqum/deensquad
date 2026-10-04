"use server";

import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminEmails, appUrl } from "../config";
import { asSystem } from "../db";
import { sendEmails } from "../email/send";
import { signInEmail } from "../email/templates";
import { PENDING_COOKIE, SESSION_COOKIE, cookieOptions, safeNext } from "./cookies";
import { readPending, type Pending } from "./pending";
import { SESSION_DAYS, SIGN_IN_MINUTES, createSession, deleteSession, ensureBootstrapAdmin, issueSignIn, verifyCode, verifyLink } from "./service";
import { cleanCode, maskEmail, normaliseEmail } from "./tokens";

export type FormState = { error?: string };


async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
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

  const result = await asSystem(async (tx) => {
    await ensureBootstrapAdmin(tx, email, adminEmails());
    return issueSignIn(tx, { email, ip: await clientIp(), now: new Date(), purpose: "sign_in" });
  });

  if (!result.ok && result.reason === "rate_limited") {
    return { error: "That's a lot of codes in one hour. Wait a little while, then try again." };
  }

  // For an address the club doesn't have, show the same screen without sending anything,
  // so the sign-in page can't be used to find out who is a member.
  let pending: Pending = { id: randomUUID(), to: maskEmail(email), next };
  if (result.ok) {
    const { requestId, code, token } = result.request;
    const base = await baseUrl();
    try {
      await sendEmails([signInEmail({ to: email, code: code!, link: base ? `${base}/sign-in/link?token=${token}` : null, appUrl: base })]);
    } catch (error) {
      console.error("[sign-in] email failed:", error instanceof Error ? error.message : error);
      return { error: "We couldn't send the email just now. Try again in a minute." };
    }
    pending = { id: requestId, to: maskEmail(email), next };
  }

  (await cookies()).set(PENDING_COOKIE, JSON.stringify(pending), cookieOptions(SIGN_IN_MINUTES * 60));
  redirect("/sign-in/code");
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
      case "expired":
        return { error: "That code has expired. Ask for a new one." };
      case "used":
        return { error: "That code has already been used. Ask for a new one." };
    }
  }
  await startSession(result.userId);
  redirect(pending.next);
}

export async function submitLink(formData: FormData): Promise<void> {
  const token = formData.get("token");
  if (typeof token !== "string" || token.length < 20) redirect("/sign-in");
  const result = await asSystem((tx) => verifyLink(tx, token, new Date()));
  if (!result.ok) redirect("/sign-in?link=expired");
  await startSession(result.userId);
  redirect("/");
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await asSystem((tx) => deleteSession(tx, token));
  store.delete(SESSION_COOKIE);
  redirect("/sign-in");
}
