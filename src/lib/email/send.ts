import "server-only";

import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { adminEmails } from "../config";

// Sends email through Resend (https://resend.com) when RESEND_API_KEY is set.
// Without a key:
//   - in development and tests, emails are written to EMAIL_OUTBOX (default .data/outbox.jsonl) and the console;
//   - in production, nothing is sent. Emails to ADMIN_EMAILS are printed to the server log instead,
//     so the first admin can sign in before email is set up. Parents' codes are never logged.

export type Email = { to: string; subject: string; text: string; html: string };

/** What happened to each email. Never throws: a failed or timed-out request lands in `failed`. */
export type EmailReport = { sent: Email[]; failed: Email[] };

/** How long any outgoing message (email, text, push) may take before it counts as not sent. */
export const SEND_TIMEOUT_MS = 10_000;

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

/**
 * Resend's `Idempotency-Key` for one request: a hash of exactly what is sent (sender, recipients, subject and both
 * bodies, which hold any sign-in code or link) and the hour. A request repeated within the hour after a timeout
 * whose email had in fact gone (Resend keeps keys for 24 hours) isn't sent twice, while a deliberate re-send carries
 * a new code or link, or comes in a later hour, so it gets a new key. Resend takes the header on single and batch
 * sends; the key changes whenever the body does, so it can never reject a different email as a repeat.
 */
export function idempotencyKey(body: unknown, now = Date.now()): string {
  const hour = Math.floor(now / 3_600_000);
  return `ds-${createHash("sha256").update(JSON.stringify(body)).update(`|${hour}`).digest("hex")}`;
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Sends each email and reports which went. Resend takes up to 100 per request, so a big send
 * is several requests: if one fails, the others still count as sent and only its emails are in `failed`.
 */
export async function sendEmails(emails: Email[]): Promise<EmailReport> {
  const report: EmailReport = { sent: [], failed: [] };
  if (emails.length === 0) return report;
  const key = process.env.RESEND_API_KEY;
  if (key) {
    for (let i = 0; i < emails.length; i += 100) {
      const group = emails.slice(i, i + 100);
      const chunk = group.map((e) => ({ from: fromAddress(), to: [e.to], subject: e.subject, text: e.text, html: e.html }));
      const body = chunk.length === 1 ? chunk[0] : chunk;
      try {
        const res = await fetch(chunk.length === 1 ? "https://api.resend.com/emails" : "https://api.resend.com/emails/batch", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey(body) },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new Error(`Resend refused the email (${res.status}): ${detail.slice(0, 300)}`);
        }
        report.sent.push(...group);
      } catch (error) {
        console.error(`[email] ${group.length} not sent:`, reason(error));
        report.failed.push(...group);
      }
    }
    return report;
  }

  const outbox = process.env.EMAIL_OUTBOX ?? (process.env.NODE_ENV !== "production" ? ".data/outbox.jsonl" : null);
  if (outbox) {
    const file = resolve(/*turbopackIgnore: true*/ outbox);
    for (const e of emails) {
      try {
        mkdirSync(dirname(file), { recursive: true });
        appendFileSync(file, JSON.stringify({ ...e, at: new Date().toISOString() }) + "\n");
        console.info(`[email] to ${e.to}: ${e.subject}`);
        report.sent.push(e);
      } catch (error) {
        console.error("[email] outbox:", reason(error));
        report.failed.push(e);
      }
    }
    return report;
  }

  const admins = adminEmails();
  for (const e of emails) {
    if (admins.has(e.to.toLowerCase())) {
      console.warn(`[email] RESEND_API_KEY is not set. Admin sign-in email for ${e.to}:\n${e.text}`);
      report.sent.push(e);
    } else {
      console.warn(`[email] RESEND_API_KEY is not set; nothing sent to a parent (${e.subject}).`);
      report.failed.push(e);
    }
  }
  return report;
}
