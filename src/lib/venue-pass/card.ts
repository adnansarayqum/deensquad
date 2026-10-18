import "server-only";

import type { HubForCache } from "../pass/cache";
import type { VenuePass } from "./data";
import { qrDataUrl } from "../qr-picture";
import { fitsOffline } from "./qr";

/** What /pass and Friday show for the parent's sports hub entry code, and what the phone keeps for no signal. */
export type VenuePassView =
  | { kind: "code"; src: string; savedAt: string; cache: HubForCache }
  | { kind: "image"; src: string; offline: boolean; savedAt: string; cache: HubForCache | null };

export async function venuePassView(pass: VenuePass | null): Promise<VenuePassView | null> {
  if (!pass) return null;
  if (pass.text) {
    try {
      return { kind: "code", src: await qrDataUrl(pass.text), savedAt: pass.updatedAt, cache: { text: pass.text } };
    } catch {
      return null;
    }
  }
  if (pass.imageId) {
    const offline = fitsOffline(pass.imageBytes ?? 0);
    return {
      kind: "image",
      src: `/api/files/${pass.imageId}`,
      offline,
      savedAt: pass.updatedAt,
      cache: offline ? { imageId: pass.imageId } : null,
    };
  }
  return null;
}
