import "server-only";
import { asSystem } from "../db";
import { deleteMediaRow, orphanedMedia } from "./data";
import { mediaStore } from "./store";

/**
 * Hourly: removes uploads attached to nothing for a day (a post never sent, a picture taken off a session, or the news,
 * session or child it was on deleted), the files first, then the row. Best-effort: never throws; a file that won't
 * delete keeps its row for the next run.
 */
export async function runMediaCleanup(now = new Date()): Promise<{ removed: number; failed: number }> {
  const store = mediaStore();
  if (!store) return { removed: 0, failed: 0 };
  let removed = 0;
  let failed = 0;
  try {
    const gone = await asSystem((tx) => orphanedMedia(tx, now));
    for (const m of gone) {
      try {
        for (const key of m.keys) await store.remove(key);
        await asSystem((tx) => deleteMediaRow(tx, m.id));
        removed++;
      } catch (error) {
        failed++;
        console.error("[media] cleanup failed:", error instanceof Error ? error.message : error);
      }
    }
  } catch (error) {
    console.error("[media] cleanup failed:", error instanceof Error ? error.message : error);
  }
  return { removed, failed };
}
