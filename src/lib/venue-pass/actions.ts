"use server";

import { refresh } from "next/cache";
import { requireParent } from "../auth/session";
import { asUser } from "../db";
import { MAX_FILE_BYTES, PHOTO_TYPES, sniff } from "../files";
import { cleanScreenshot } from "../photo-clean";
import { clearMyVenuePass, setMyVenuePassImage, setMyVenuePassText } from "./data";
import { cleanVenueCode } from "./qr";
import { readQrFromImage } from "./read-server";

// The parent's own sports hub entry code on /pass. With JavaScript the phone reads the QR code in the screenshot and
// sends only its text (`code`); otherwise, or when there's no readable code in it, the screenshot itself
// (`screenshot`), re-encoded here before it's stored. Only ever the signed-in parent's own row.

export type VenuePassState = { error?: string; saved?: "code" | "image" | "removed" };

export async function saveVenuePass(_prev: VenuePassState, formData: FormData): Promise<VenuePassState> {
  const user = await requireParent();
  const code = formData.get("code");
  if (typeof code === "string" && code !== "") {
    const text = cleanVenueCode(code);
    if (!text) return { error: "That code is too long to keep. Try the screenshot again." };
    await asUser(user.id, (tx) => setMyVenuePassText(tx, text));
    refresh();
    return { saved: "code" };
  }

  const file = formData.get("screenshot");
  if (!file || typeof file === "string" || file.size === 0) return { error: "Choose a screenshot first." };
  if (file.size > MAX_FILE_BYTES) {
    return { error: `That picture is ${(Math.ceil((file.size / (1024 * 1024)) * 10) / 10).toFixed(1)} MB. The limit is 8 MB. Try a screenshot.` };
  }
  const data = new Uint8Array(await file.arrayBuffer());
  const mime = sniff(data);
  if (!mime || !(PHOTO_TYPES as readonly string[]).includes(mime)) return { error: "Choose a screenshot (a PNG, JPEG or WebP picture)." };
  // A code the phone didn't read may still be readable here: then it's kept as text and drawn crisp.
  const read = cleanVenueCode(await readQrFromImage(data));
  if (read) {
    await asUser(user.id, (tx) => setMyVenuePassText(tx, read));
    refresh();
    return { saved: "code" };
  }
  // Always re-encoded: no location or other details kept, at most 1200px.
  const clean = await cleanScreenshot(data);
  if (!clean) return { error: "We couldn't open that picture. Try another screenshot." };
  await asUser(user.id, (tx) => setMyVenuePassImage(tx, clean));
  refresh();
  return { saved: "image" };
}

export async function removeVenuePass(): Promise<VenuePassState> {
  const user = await requireParent();
  await asUser(user.id, (tx) => clearMyVenuePass(tx));
  refresh();
  return { saved: "removed" };
}
