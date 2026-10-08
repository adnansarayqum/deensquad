import "server-only";

import { asSystem } from "../db";
import { saveFile } from "../files";
import { fetchImage } from "./fetch-image";

// Product photos given as links (pasted by an admin, or the imported kit photos, whose links expire)
// are copied into the app's own storage so the shop never shows a broken image. The fetch itself (public https
// hosts only, redirects followed by hand) is in fetch-image.ts.

/** Copies every linked product photo into club_files. Never throws; returns how many were copied. */
export async function localiseProductImages(): Promise<number> {
  try {
    const pending = await asSystem((tx) =>
      tx.query<{ id: string; name: string; image_url: string }>(
        `select id, name, image_url from shop_products where image_url is not null and image_file_id is null`,
      ),
    );
    let copied = 0;
    for (const p of pending) {
      try {
        const image = await fetchImage(p.image_url);
        if (!image) continue;
        const ext = image.mime.split("/")[1];
        await asSystem(async (tx) => {
          const fileId = await saveFile(tx, { name: `${p.name}.${ext}`.slice(0, 100), mime: image.mime, data: image.data }, null);
          await tx.query(`update shop_products set image_file_id = $2, image_url = null where id = $1`, [p.id, fileId]);
        });
        copied++;
      } catch (error) {
        console.error(`[shop] couldn't copy the photo for ${p.name}:`, error instanceof Error ? error.message : error);
      }
    }
    if (copied) console.info(`[shop] copied ${copied} product photo(s) into the app`);
    return copied;
  } catch (error) {
    console.error("[shop] photo copy failed:", error instanceof Error ? error.message : error);
    return 0;
  }
}
