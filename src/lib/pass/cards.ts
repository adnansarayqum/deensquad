import "server-only";

import type { Child } from "../domain";
import { qrDataUrl } from "../qr-picture";
import { passToken } from "./token";

/** Each child's attendance QR code: its text (also kept on the phone for no signal) and the picture /pass shows (a PNG data URL, see qr-picture.ts). */
export type PassCard = { id: string; firstName: string; ageGroup: string; token: string; src: string; photoFileId: string | null };

export function passCards(children: Child[]): Promise<PassCard[]> {
  return Promise.all(
    children.map(async (c) => {
      const token = passToken(c.id);
      return {
        id: c.id,
        firstName: c.firstName,
        ageGroup: c.ageGroup,
        token,
        src: await qrDataUrl(token),
        photoFileId: c.photoFileId ?? null,
      };
    }),
  );
}

/** What PassCacheWriter keeps on the phone: no ids or pictures. */
export const cachedPasses = (cards: PassCard[]) => cards.map(({ token, firstName, ageGroup }) => ({ token, firstName, ageGroup }));
