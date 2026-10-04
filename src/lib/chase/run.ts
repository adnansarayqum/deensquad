import "server-only";

import { asSystem } from "../db";
import { runLadder, type LadderResult } from "./ladder";
import { liveSenders } from "./senders";

/** Runs the ladder for every message (the hourly job), or just one (right after it's posted). */
export function runChase(opts: { announcementId?: string; now?: Date } = {}): Promise<LadderResult> {
  return asSystem((tx) => runLadder(tx, opts.now ?? new Date(), liveSenders(), opts.announcementId));
}
