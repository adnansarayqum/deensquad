import type { Queryable } from "./db/types";
import { iso } from "./db/types";

// A parent's "Ask the club to delete my account" (Player → Your data), recorded in data_requests (migration 0017).
// The club is emailed and admins see open requests on the overview; an admin removes the family on Admin → Families
// (the request is then closed by a trigger) or marks it done. Nothing is deleted automatically.

/** Records the signed-in parent's request. True when it's new, false when they had already asked (no second email). */
export async function requestAccountDeletion(tx: Queryable): Promise<boolean> {
  const [row] = await tx.query<{ created: boolean }>(`select request_account_deletion() as created`);
  return row?.created === true;
}

/** When the signed-in parent asked to be deleted, if they have a request still open. */
export async function loadMyDeletionRequest(tx: Queryable): Promise<string | null> {
  const [row] = await tx.query<{ created_at: Date }>(
    `select created_at from data_requests where guardian_id = my_guardian_id() and kind = 'delete' and handled_at is null`,
  );
  return row ? iso(row.created_at) : null;
}

export type OpenDeletionRequest = {
  id: string;
  askedAt: string;
  parentName: string;
  children: { id: string; name: string }[];
};

/** Open requests, oldest first, with the parent's children to link to. Admins only (row level security). */
export async function loadOpenDeletionRequests(tx: Queryable): Promise<OpenDeletionRequest[]> {
  const rows = await tx.query<{ id: string; created_at: Date; first_name: string | null; last_name: string | null; children: { id: string; name: string }[] | null }>(
    `select r.id, r.created_at, g.first_name, g.last_name,
       (select json_agg(json_build_object('id', p.id, 'name', p.first_name || ' ' || p.last_name) order by p.first_name)
        from player_guardians pg join players p on p.id = pg.player_id where pg.guardian_id = g.id) as children
     from data_requests r left join guardians g on g.id = r.guardian_id
     where r.kind = 'delete' and r.handled_at is null
     order by r.created_at`,
  );
  return rows.map((r) => ({
    id: r.id,
    askedAt: iso(r.created_at),
    parentName: [r.first_name, r.last_name].filter(Boolean).join(" ") || "A parent",
    children: typeof r.children === "string" ? JSON.parse(r.children) : (r.children ?? []),
  }));
}

/** An admin's "Done": the family has been dealt with. True if it closed an open request. */
export async function closeDeletionRequest(tx: Queryable, id: string): Promise<boolean> {
  const rows = await tx.query(`update data_requests set handled_at = now() where id = $1 and handled_at is null returning id`, [id]);
  return rows.length > 0;
}

const addresses = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter((e) => e.includes("@"));

/**
 * Who hears about a deletion request: the club's contact address (CLUB_EMAIL), else ALERT_EMAIL, else ADMIN_EMAILS,
 * else the admins on the Staff screen (passed in, as only the system connection can read their emails).
 */
export function deletionRequestRecipients(env: Record<string, string | undefined>, staffAdmins: string[]): string[] {
  for (const key of ["CLUB_EMAIL", "ALERT_EMAIL", "ADMIN_EMAILS"]) {
    const found = addresses(env[key]);
    if (found.length) return [...new Set(found)];
  }
  return [...new Set(staffAdmins.filter((e) => e.includes("@")))];
}
