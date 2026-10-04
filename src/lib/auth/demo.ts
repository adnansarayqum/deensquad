"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEV_EMAILS } from "../db/dev-seed";
import { asSystem, isDemo } from "../db";
import { SESSION_COOKIE, cookieOptions } from "./cookies";
import { SESSION_DAYS, completeSignIn, createSession } from "./service";

// One-tap sign-in for the demo copy only (DEMO_MODE=1 with an in-memory database of sample data).

const ROLES = { parent: DEV_EMAILS.parent, admin: DEV_EMAILS.admin, coach: DEV_EMAILS.coach } as const;

export async function demoSignIn(formData: FormData): Promise<void> {
  if (!isDemo()) redirect("/sign-in");
  const role = formData.get("role");
  if (role !== "parent" && role !== "admin" && role !== "coach") redirect("/sign-in");
  const token = await asSystem(async (tx) => createSession(tx, await completeSignIn(tx, ROLES[role], new Date()), new Date()));
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(SESSION_DAYS * 86400));
  redirect(role === "coach" ? "/coach" : "/");
}
