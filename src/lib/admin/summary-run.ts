import "server-only";

import { appUrl } from "../config";
import { asSystem } from "../db";
import { sendEmails } from "../email/send";
import { sendMonthlySummary, type SummaryRunResult } from "./summary";

/** The hourly job's monthly summary step (POST /api/cron/chase). Never throws: a failure is logged and the chase goes on. */
export async function runMonthlySummary(now = new Date()): Promise<SummaryRunResult | { error: string }> {
  try {
    return await sendMonthlySummary({ system: asSystem, send: sendEmails, appUrl: appUrl(), env: process.env }, now);
  } catch (error) {
    console.error("[summary] failed:", error instanceof Error ? error.message : error);
    return { error: "failed" };
  }
}
