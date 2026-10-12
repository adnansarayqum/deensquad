import "server-only";

import QRCode from "qrcode";
import type { HubForCache } from "../pass/cache";
import type { VenuePass } from "./data";
import { fitsOffline, VENUE_QR_OPTIONS } from "./qr";

/** What /pass and Friday show for the parent's sports hub entry code, and what the phone keeps for no signal. */
export type VenuePassView =
  | { kind: "code"; svg: string; savedAt: string; cache: HubForCache }
  | { kind: "image"; src: string; offline: boolean; savedAt: string; cache: HubForCache | null };

export async function venuePassView(pass: VenuePass | null): Promise<VenuePassView | null> {
  if (!pass) return null;
  if (pass.text) {
    try {
      const svg = await QRCode.toString(pass.text, { type: "svg", ...VENUE_QR_OPTIONS });
      return { kind: "code", svg, savedAt: pass.updatedAt, cache: { text: pass.text } };
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
