import "server-only";

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { adminEmails } from "../config";

// Sends email through Resend (https://resend.com) when RESEND_API_KEY is set.
// Without a key:
//   - in development and tests, emails are written to EMAIL_OUTBOX (default .data/outbox.jsonl) and the console;
//   - in production, nothing is sent. Emails to ADMIN_EMAILS are printed to the server log instead,
//     so the first admin can sign in before email is set up. Parents' codes are never logged.

export type Email = { to: string; subject: string; text: string; html: string };

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/** True when emails will actually go somewhere: Resend, or the development outbox. */
export function canSendEmail(): boolean {
  return emailConfigured() || Boolean(process.env.EMAIL_OUTBOX) || process.env.NODE_ENV !== "production";
}

function fromAddress(): string {
  return process.env.EMAIL_FROM?.trim() || "Deen Squad <onboarding@resend.dev>";
}

export async function sendEmails(emails: Email[]): Promise<void> {
  if (emails.length === 0) return;
  const key = process.env.RESEND_API_KEY;
  if (key) {
    // Resend's batch endpoint takes up to 100 emails per request.
    for (let i = 0; i < emails.length; i += 100) {
      const chunk = emails.slice(i, i + 100).map((e) => ({ from: fromAddress(), to: [e.to], subject: e.subject, text: e.text, html: e.html }));
      const res = await fetch(chunk.length === 1 ? "https://api.resend.com/emails" : "https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(chunk.length === 1 ? chunk[0] : chunk),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Resend refused the email (${res.status}): ${detail.slice(0, 300)}`);
      }
    }
    return;
  }

  const outbox = process.env.EMAIL_OUTBOX ?? (process.env.NODE_ENV !== "production" ? ".data/outbox.jsonl" : null);
  if (outbox) {
    const file = resolve(outbox);
    mkdirSync(dirname(file), { recursive: true });
    for (const e of emails) {
      appendFileSync(file, JSON.stringify({ ...e, at: new Date().toISOString() }) + "\n");
      console.info(`[email] to ${e.to}: ${e.subject}`);
    }
    return;
  }

  const admins = adminEmails();
  for (const e of emails) {
    if (admins.has(e.to.toLowerCase())) {
      console.warn(`[email] RESEND_API_KEY is not set. Admin sign-in email for ${e.to}:\n${e.text}`);
    } else {
      console.warn(`[email] RESEND_API_KEY is not set; nothing sent to a parent (${e.subject}).`);
    }
  }
}
