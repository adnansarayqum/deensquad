import "server-only";

import QRCode from "qrcode";
import type { Child } from "../domain";
import { passToken } from "./token";

/** Each child's attendance QR code: its text (also kept on the phone for no signal) and the picture /pass shows. */
export type PassCard = { id: string; firstName: string; ageGroup: string; token: string; svg: string };

export function passCards(children: Child[]): Promise<PassCard[]> {
  return Promise.all(
    children.map(async (c) => {
      const token = passToken(c.id);
      return {
        id: c.id,
        firstName: c.firstName,
        ageGroup: c.ageGroup,
        token,
        svg: await QRCode.toString(token, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#13201a", light: "#ffffff" } }),
      };
    }),
  );
}

/** What PassCacheWriter keeps on the phone: no ids or pictures. */
export const cachedPasses = (cards: PassCard[]) => cards.map(({ token, firstName, ageGroup }) => ({ token, firstName, ageGroup }));
