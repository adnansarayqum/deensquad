import type { Queryable } from "../db/types";
import { MAX_MEDIA_ITEMS, ORPHAN_HOURS } from "./limits";

// The media rows (migration 0038) and what they're attached to. Reading goes through row level security: a parent
// gets only pictures and videos on news, sessions and messages they can already read.

export type MediaItem = {
  id: string;
  kind: "image" | "video";
  width: number | null;
  height: number | null;
  duration: number | null;
  poster: boolean;
};

export type MediaTarget = "announcement" | "session" | "message";

const LINK: Record<MediaTarget, { table: string; column: string }> = {
  announcement: { table: "announcement_media", column: "announcement_id" },
  session: { table: "session_media", column: "session_id" },
  message: { table: "message_media", column: "message_id" },
};

type Row = { id: string; kind: "image" | "video"; width: number | null; height: number | null; duration_seconds: number | null; has_poster: boolean };
const item = (r: Row): MediaItem => ({ id: r.id, kind: r.kind, width: r.width, height: r.height, duration: r.duration_seconds, poster: r.has_poster });

/** The pictures and videos on each of `ids` (news, sessions or messages), in the order they were added. */
export async function loadMediaFor(tx: Queryable, target: MediaTarget, ids: readonly string[]): Promise<Map<string, MediaItem[]>> {
  const out = new Map<string, MediaItem[]>();
  if (ids.length === 0) return out;
  const { table, column } = LINK[target];
  const rows = await tx.query<Row & { owner: string }>(
    `select l.${column}::text as owner, m.id, m.kind, m.width, m.height, m.duration_seconds, m.poster_key is not null as has_poster
     from ${table} l join media m on m.id = l.media_id
     where l.${column} = any ($1::uuid[])
     order by l.${column}, l.position`,
    [[...new Set(ids)]],
  );
  for (const r of rows) {
    const list = out.get(r.owner) ?? [];
    list.push(item(r));
    out.set(r.owner, list);
  }
  return out;
}

/** Uploads waiting to be attached, for a form that comes back with an error: the uploader's own, still unlinked. */
export async function loadPendingMedia(tx: Queryable, ids: readonly string[], staffId: string): Promise<MediaItem[]> {
  if (ids.length === 0) return [];
  const rows = await tx.query<Row>(
    `select m.id, m.kind, m.width, m.height, m.duration_seconds, m.poster_key is not null as has_poster
     from media m where m.id = any ($1::uuid[]) and m.uploaded_by = $2`,
    [[...new Set(ids)], staffId],
  );
  const byId = new Map(rows.map((r) => [r.id, item(r)]));
  return ids.map((i) => byId.get(i)).filter((m): m is MediaItem => Boolean(m));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The `media` ids a form posted, in order, each once. */
export function mediaIdsFrom(formData: FormData): string[] {
  const ids = formData.getAll("media").filter((v): v is string => typeof v === "string" && UUID.test(v));
  return [...new Set(ids)];
}

/**
 * Attaches the pictures and videos `ids` to a post, session or message, in order. Each must be this member of
 * staff's own upload and not attached to anything else (or, for a session being edited, already on it); a session's
 * list replaces what it had. Returns an error to show, or null.
 */
export async function attachMedia(tx: Queryable, target: MediaTarget, ownerId: string, ids: readonly string[], staffId: string): Promise<string | null> {
  const { table, column } = LINK[target];
  if (ids.length > MAX_MEDIA_ITEMS) return `Add up to ${MAX_MEDIA_ITEMS} photos and videos.`;
  if (ids.length) {
    const ok = await tx.query<{ id: string }>(
      `select m.id from media m
       where m.id = any ($1::uuid[])
         and (
           (m.uploaded_by = $2
             and not exists (select 1 from announcement_media l where l.media_id = m.id)
             and not exists (select 1 from session_media l where l.media_id = m.id)
             and not exists (select 1 from message_media l where l.media_id = m.id))
           or exists (select 1 from ${table} l where l.media_id = m.id and l.${column} = $3)
         )`,
      [[...ids], staffId, ownerId],
    );
    if (ok.length !== ids.length) return "One of the photos or videos has gone. Remove it and add it again.";
  }
  if (target === "session") {
    // Taken off and put back in the new order; anything left off is cleaned up with the other unattached uploads.
    await tx.query(`delete from session_media where session_id = $1`, [ownerId]);
  }
  if (ids.length) {
    await tx.query(
      `insert into ${table} (${column}, media_id, position)
       select $1::uuid, m.id, m.n::smallint from unnest($2::uuid[]) with ordinality as m(id, n)`,
      [ownerId, [...ids]],
    );
  }
  return null;
}

export type NewMedia = {
  kind: "image" | "video";
  mime: string;
  bytes: number;
  objectKey: string;
  posterKey: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  uploadedBy: string;
};

export async function insertMedia(tx: Queryable, m: NewMedia): Promise<string> {
  const [{ id }] = await tx.query<{ id: string }>(
    `insert into media (kind, mime, bytes, object_key, poster_key, width, height, duration_seconds, uploaded_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [m.kind, m.mime, m.bytes, m.objectKey, m.posterKey, m.width, m.height, m.duration === null ? null : Math.round(m.duration), m.uploadedBy],
  );
  return id;
}

/** One file to serve, if this person may see it (row level security decides). */
export async function findMedia(tx: Queryable, id: string): Promise<{ kind: "image" | "video"; mime: string; objectKey: string; posterKey: string | null } | null> {
  const [row] = await tx.query<{ kind: "image" | "video"; mime: string; object_key: string; poster_key: string | null }>(
    `select kind, mime, object_key, poster_key from media where id = $1`,
    [id],
  );
  return row ? { kind: row.kind, mime: row.mime, objectKey: row.object_key, posterKey: row.poster_key } : null;
}

/** As the system: uploads attached to nothing for a day (a form never sent; what they were on deleted). */
export async function orphanedMedia(tx: Queryable, now: Date, limit = 200): Promise<{ id: string; keys: string[] }[]> {
  const rows = await tx.query<{ id: string; object_key: string; poster_key: string | null }>(
    `select m.id, m.object_key, m.poster_key from media m
     where m.created_at < $1::timestamptz - make_interval(hours => $2)
       and not exists (select 1 from announcement_media l where l.media_id = m.id)
       and not exists (select 1 from session_media l where l.media_id = m.id)
       and not exists (select 1 from message_media l where l.media_id = m.id)
     order by m.created_at limit $3`,
    [now, ORPHAN_HOURS, limit],
  );
  return rows.map((r) => ({ id: r.id, keys: [r.object_key, ...(r.poster_key ? [r.poster_key] : [])] }));
}

export async function deleteMediaRow(tx: Queryable, id: string): Promise<void> {
  await tx.query(`delete from media where id = $1`, [id]);
}
