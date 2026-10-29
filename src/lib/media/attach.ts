import "server-only";
import type { Queryable } from "../db/types";
import { attachMedia, mediaIdsFrom, type MediaTarget } from "./data";
import { receiveFormMedia } from "./upload";

// Used by the actions that save news, sessions and staff messages with their photos and videos.

/** A picture or video that can't be attached: thrown inside the transaction so nothing of the post is kept. */
class MediaProblem extends Error {}

/** The form's uploads: ids from the picker (with JavaScript), or files sent with the form (without). */
export async function formMedia(formData: FormData, staffId: string): Promise<{ ids: string[] } | { error: string }> {
  const sent = await receiveFormMedia(formData, staffId);
  if ("error" in sent) return sent;
  return { ids: [...mediaIdsFrom(formData), ...sent.ids] };
}

export async function attachOrThrow(tx: Queryable, target: MediaTarget, ownerId: string, ids: string[], staffId: string): Promise<void> {
  if (ids.length === 0 && target !== "session") return;
  const problem = await attachMedia(tx, target, ownerId, ids, staffId);
  if (problem) throw new MediaProblem(problem);
}

export async function withMediaProblem<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof MediaProblem) return { error: e.message };
    throw e;
  }
}
