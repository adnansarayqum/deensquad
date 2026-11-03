import "server-only";

import { adminEmails, appUrl } from "./config";
import { isClientDisconnect } from "./client-disconnect";
import { isMalformedActionBody } from "./malformed-body";
import { emailConfigured, sendEmails } from "./email/send";

// Emails the app's maintainer when a page or action fails on the live app, at most once every
// 30 minutes (with a count of what happened in between). Only the path and the error message are sent:
// no query strings, form data or personal details. Crashes and failed deploys are already emailed by Railway.

const QUIET_MS = 30 * 60_000;
// Server errors and browser reports keep separate windows, so reports from phones (which any signed-in person can
// send) can never hold back the email about a real server failure.
type Channel = "server" | "browser";
const windows: Record<Channel, { lastSent: number; suppressed: number }> = { server: { lastSent: 0, suppressed: 0 }, browser: { lastSent: 0, suppressed: 0 } };

function recipients(): string[] {
  const configured = (process.env.ALERT_EMAIL ?? "").split(",").map((e) => e.trim()).filter((e) => e.includes("@"));
  return configured.length ? configured : [...adminEmails()];
}

export { isClientDisconnect, isMalformedActionBody };

export async function sendErrorAlert(
  error: { name?: string; message: string; digest?: string; path: string; kind: string },
  now = Date.now(),
  channel: Channel = "server",
): Promise<boolean> {
  const w = windows[channel];
  if (process.env.NODE_ENV !== "production" || !emailConfigured()) return false;
  if (isClientDisconnect(error.message)) return false;
  if (isMalformedActionBody(error, error.kind.split(" ")[0])) return false;
  if (now - w.lastSent < QUIET_MS) {
    w.suppressed++;
    return false;
  }
  const to = recipients();
  if (to.length === 0) return false;
  const others = w.suppressed;
  w.lastSent = now;
  w.suppressed = 0;
  const path = error.path.split("?")[0].slice(0, 200);
  const text = [
    `Something went wrong on the Deen Squad app.`,
    ``,
    `Where: ${path} (${error.kind})`,
    `Error: ${error.message.slice(0, 500)}`,
    ...(error.digest ? [`Reference: ${error.digest}`] : []),
    ...(others ? [``, `${others} other error${others === 1 ? "" : "s"} since the last alert.`] : []),
    ``,
    `The full details are in the Railway logs for parent-app.${appUrl() ? ` App: ${appUrl()}` : ""}`,
  ].join("\n");
  try {
    const { sent } = await sendEmails(to.map((email) => ({ to: email, subject: `Deen Squad app error: ${path}`, text, html: `<pre style="font-family:monospace;white-space:pre-wrap">${text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</pre>` })));
    return sent.length > 0;
  } catch {
    return false;
  }
}

const warnedSessions = new Set<string>();

/**
 * "The scanner may not be working": once per session (and an idempotency key, so a second server can't repeat it), to
 * the same people as error alerts. See src/lib/staff/scanner-watch.ts.
 */
export async function sendScannerWarning(sessionId: string, title: string, manual: number): Promise<boolean> {
  if (process.env.NODE_ENV !== "production" || !emailConfigured() || warnedSessions.has(sessionId)) return false;
  const to = recipients();
  if (to.length === 0) return false;
  warnedSessions.add(sessionId);
  const text = [
    `At ${title} today, ${manual} children have been marked here by hand and no QR code has been scanned.`,
    ``,
    `If coaches aren't using the scanner on purpose, it may not be working. Ask a coach to open Scan QR codes and try one code. Mark here still works in the meantime.`,
    ...(appUrl() ? [``, `Register: ${appUrl()}/coach`] : []),
  ].join("\n");
  const { sent } = await sendEmails(
    to.map((email) => ({ to: email, subject: `Deen Squad: no QR scans at ${title} today`, text, html: `<p>${text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!).replace(/\n/g, "<br>")}</p>`, idempotencyKey: `scanner-quiet:${sessionId}:${email}` })),
  );
  if (sent.length === 0) warnedSessions.delete(sessionId);
  return sent.length > 0;
}

/**
 * A background or hourly job that failed: logged, and the club's alert address is emailed (at most one a half hour,
 * like any server error), so a job that keeps failing — reminders, notifications, the summary — never fails quietly.
 * Never throws.
 */
export function reportJobFailure(job: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${job}] failed:`, message);
  void sendErrorAlert({ message: `${job} failed: ${message}`, path: `job: ${job}`, kind: "background job" }).catch(() => undefined);
}
