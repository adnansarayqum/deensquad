"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIpFrom } from "../auth/ip";
import { windowCounter } from "../calendar/feed";
import { asSystem } from "../db";
import { confirmReadLink, parseReadToken } from "./read-link";

// The one tap on /read/<token> (the reminder email's button). No sign-in: the signed link is the key, and all it can
// do is mark that parent's read of that post. Limited per address so nobody can hammer it.

const perAddress = windowCounter(60);

export async function confirmRead(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  if (!parseReadToken(token)) redirect("/sign-in");
  const ip = clientIpFrom(await headers()) ?? "unknown";
  if (!perAddress.hit(ip)) redirect(`/read/${token}?busy=1`);
  const ok = await asSystem((tx) => confirmReadLink(tx, token));
  redirect(ok ? `/read/${token}?done=1` : `/read/${token}`);
}
