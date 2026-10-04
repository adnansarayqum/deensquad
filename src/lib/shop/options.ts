import "server-only";

import { bankDetails } from "../config";
import { isDemo } from "../db";
import type { PayBy } from "./data";
import { sumupConfigured } from "./sumup";

/** How parents can pay right now: card through SumUp, bank transfer into the club account, or both. */
export function paymentOptions(): PayBy[] {
  return [...(sumupConfigured() || isDemo() ? (["card"] as const) : []), ...(bankDetails() ? (["bank"] as const) : [])];
}
