import "server-only";

import { adminEmails, appUrl } from "./config";
import { isClientDisconnect } from "./client-disconnect";
import { isMalformedActionBody } from "./malformed-body";
import { emailConfigured, sendEmails } from "./email/send";

// Emails the app's maintainer when a page or action fails on the live app, at most once every
// 30 minutes (with a count of what happened in between). Only the path and the error message are sent:
// no query strings, form data or personal details. Crashes and failed deploys are already emailed by Railway.

const QUIET_MS = 30 * 60_000;
let lastSent = 0;
let suppressed = 0;

function recipients(): string[] {
  const configured = (process.env.ALERT_EMAIL ?? "").split(",").map((e) => e.trim()).filter((e) => e.includes("@"));
  return configured.length ? configured : [...adminEmails()];
}

export { isClientDisconnect, isMalformedActionBody };

export async function sendErrorAlert(error: { name?: string; message: string; digest?: string; path: string; kind: string }, now = Date.now()): Promise<boolean> {
  if (process.env.NODE_ENV !== "production" || !emailConfigured()) return false;
  if (isClientDisconnect(error.message)) return false;
  if (isMalformedActionBody(error, error.kind.split(" ")[0])) return false;
  if (now - lastSent < QUIET_MS) {
    suppressed++;
    return false;
  }
  const to = recipients();
  if (to.length === 0) return false;
  const others = suppressed;
  lastSent = now;
  suppressed = 0;
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
