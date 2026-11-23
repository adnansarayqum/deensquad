"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "../auth/session";
import { UUID } from "../auth/tokens";
import { asUser } from "../db";
import { readUpload, saveFile } from "../files";
import { cleanLogo } from "../photo-clean";
import { cleanText } from "../validate";
import { cleanSponsorLink } from "./data";

export type SponsorFormState = { error?: string; saved?: boolean; message?: string };
type Row = { id: string; logo_file_id: string | null; icon_file_id: string | null };
/** The small icon is only ever drawn at 28 to 64px. */
const ICON_SIDE = 256;

/** Adds a sponsor or saves changes to one (admins only). The logo is re-encoded before it's kept. */
export async function saveSponsor(_prev: SponsorFormState, formData: FormData): Promise<SponsorFormState> {
  const user = await requireAdmin();
  const id = formData.get("id");
  const name = cleanText(formData.get("name"), 80);
  const linkText = String(formData.get("link") ?? "").trim();
  const link = linkText ? cleanSponsorLink(linkText) : null;
  const upload = await readUpload(formData.get("logo"));
  const removeLogo = formData.get("removeLogo") === "on";
  const iconUpload = await readUpload(formData.get("icon"));
  const removeIcon = formData.get("removeIcon") === "on";
  if (!name) return { error: "Add the sponsor's name." };
  if (linkText && !link) return { error: "The link should be a full address starting with https://" };
  if (!upload.ok) return { error: upload.error };
  if (upload.upload?.mime === "application/pdf") return { error: "Use a picture (JPEG, PNG or WebP) for the logo, not a PDF." };
  if (!iconUpload.ok) return { error: iconUpload.error };
  if (iconUpload.upload?.mime === "application/pdf") return { error: "Use a picture (JPEG, PNG or WebP) for the small icon, not a PDF." };
  const logo = upload.upload ? await cleanLogo(upload.upload.data) : null;
  if (upload.upload && !logo) return { error: "That picture couldn't be read. Try saving the logo as a PNG or JPEG." };
  const icon = iconUpload.upload ? await cleanLogo(iconUpload.upload.data, ICON_SIDE) : null;
  if (iconUpload.upload && !icon) return { error: "The small icon couldn't be read. Try saving it as a PNG or JPEG." };

  const values = [
    name,
    cleanText(formData.get("sponsorsWhat"), 80),
    cleanText(formData.get("about"), 300),
    link,
    cleanText(formData.get("offer"), 200),
    cleanText(formData.get("offerHow"), 200),
    formData.get("active") === "on",
    Math.max(-999, Math.min(999, Math.trunc(Number(formData.get("sort")) || 0))),
  ];
  const saved = await asUser(user.id, async (tx) => {
    const existing = typeof id === "string" && UUID.test(id) ? id : null;
    const [row] = existing
      ? await tx.query<Row>(
          `update sponsors set name = $2, sponsors_what = $3, about = $4, link_url = $5, offer = $6, offer_how = $7, active = $8, sort = $9
           where id = $1 returning id, logo_file_id, icon_file_id`,
          [existing, ...values],
        )
      : await tx.query<Row>(
          `insert into sponsors (name, sponsors_what, about, link_url, offer, offer_how, active, sort)
           values ($1, $2, $3, $4, $5, $6, $7, $8) returning id, logo_file_id, icon_file_id`,
          values,
        );
    if (!row) return false;
    if (logo || removeLogo) {
      const fileId = logo ? await saveFile(tx, { name: "sponsor-logo.png", mime: logo.mime, data: logo.data }, user.staff.id) : null;
      await tx.query(`update sponsors set logo_file_id = $2, logo_bg = $3 where id = $1`, [row.id, fileId, logo?.bg ?? null]);
      if (row.logo_file_id) await tx.query(`delete from club_files where id = $1`, [row.logo_file_id]);
    }
    if (icon || removeIcon) {
      const fileId = icon ? await saveFile(tx, { name: "sponsor-icon.png", mime: icon.mime, data: icon.data }, user.staff.id) : null;
      await tx.query(`update sponsors set icon_file_id = $2, icon_bg = $3 where id = $1`, [row.id, fileId, icon?.bg ?? null]);
      if (row.icon_file_id) await tx.query(`delete from club_files where id = $1`, [row.icon_file_id]);
    }
    return true;
  });
  if (!saved) return { error: "That sponsor isn't there any more. Reload the page." };
  refresh();
  return { saved: true };
}

/** Takes a sponsor off for good, with its logo (admins only; the form's "Yes" box must be ticked). */
export async function removeSponsor(_prev: SponsorFormState, formData: FormData): Promise<SponsorFormState> {
  const user = await requireAdmin();
  const id = formData.get("id");
  if (typeof id !== "string" || !UUID.test(id)) return { error: "That sponsor isn't there any more. Reload the page." };
  if (formData.get("confirm") !== "yes") return { error: "Tick the box to remove this sponsor." };
  await asUser(user.id, async (tx) => {
    const [row] = await tx.query<{ logo_file_id: string | null; icon_file_id: string | null }>(
      `delete from sponsors where id = $1 returning logo_file_id, icon_file_id`,
      [id],
    );
    const files = [row?.logo_file_id, row?.icon_file_id].filter((f): f is string => !!f);
    if (files.length) await tx.query(`delete from club_files where id = any($1::uuid[])`, [files]);
  });
  refresh();
  return { saved: true, message: "Sponsor removed." };
}
