import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { UUID } from "../auth/tokens";
import { isDemo } from "../db";
import type { Queryable } from "../db/types";

// "I've read this" from the reminder email, with no sign-in (migration 0058). The email's button is a link signed for
// one parent and one post: "<post id>.<parent id>.<signature>". Opening it only shows a button, because email scanners
// open links by themselves; the tap is what records the read. All it can ever do is say that this parent has read this
// post, so it needs no expiry beyond the post's own age.

/** The same secret as the attendance QR codes (changing it cancels links in old emails too), with its own prefix. */
function secret(): string {
  const s = process.env.QR_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV !== "production" || isDemo()) return "development-only-qr-secret";
  throw new Error("QR_SECRET is not set.");
}

const sign = (newsId: string, guardianId: string) =>
  createHmac("sha256", secret()).update(`read.${newsId.toLowerCase()}.${guardianId.toLowerCase()}`).digest("base64url").slice(0, 32);

/** How long after posting the email's button still works. */
export const READ_LINK_DAYS = 60;

export function readToken(newsId: string, guardianId: string): string {
  return `${newsId}.${guardianId}.${sign(newsId, guardianId)}`;
}

/** The post and parent a token names, when its signature is right. */
export function parseReadToken(token: string): { newsId: string; guardianId: string } | null {
  const [newsId, guardianId, sig, ...rest] = token.split(".");
  if (rest.length || !newsId || !guardianId || !sig || !UUID.test(newsId) || !UUID.test(guardianId)) return null;
  const want = Buffer.from(sign(newsId, guardianId));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return { newsId, guardianId };
}

export type ReadLink = { newsId: string; guardianId: string; title: string; firstName: string; read: boolean };

/** What the page shows: the post's headline and whether this parent has read it already. Run as the system. */
export async function peekReadLink(tx: Queryable, token: string): Promise<ReadLink | null> {
  const ids = parseReadToken(token);
  if (!ids) return null;
  const [row] = await tx.query<{ title: string; first_name: string; read: boolean }>(
    `select a.title, g.first_name,
       exists (select 1 from announcement_reads r where r.announcement_id = a.id and r.guardian_id = g.id) as read
     from announcements a, guardians g
     where a.id = $1 and g.id = $2 and a.requires_ack
       and a.quick_answers is null and coalesce(a.session_notice, '') <> 'attendance'
       and a.posted_at > now() - make_interval(days => $3::int)`,
    [ids.newsId, ids.guardianId, READ_LINK_DAYS],
  );
  return row ? { ...ids, title: row.title, firstName: row.first_name, read: row.read } : null;
}

/** The tap: this parent has read this post (and so has seen it). Run as the system. Returns whether the link was good. */
export async function confirmReadLink(tx: Queryable, token: string): Promise<boolean> {
  const link = await peekReadLink(tx, token);
  if (!link) return false;
  await tx.query(`insert into announcement_reads (announcement_id, guardian_id, via) values ($1, $2, 'email') on conflict do nothing`, [link.newsId, link.guardianId]);
  await tx.query(`insert into announcement_views (announcement_id, guardian_id) values ($1, $2) on conflict do nothing`, [link.newsId, link.guardianId]);
  return true;
}
