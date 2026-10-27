import type { Queryable } from "../db/types";
import type { PaymentState } from "../domain";
import { parseCsv } from "../admin/csv";

// TeamFeePay export import (the roadmap's "TeamFeePay export import"; the FootballPro comparison showed online fees
// as the gap clubs ask about first). The club collects monthly fees on TeamFeePay; until now a plan showed as "active"
// only when an admin set it, or as "parent says it's set up" when a parent tapped "I've set it up". An admin exports
// the members list from TeamFeePay and uploads it here: each row is matched to a child and the plan set from its
// status. We don't have TeamFeePay's exact column names, so the header is read leniently (child name, or first and
// last name; payer/parent email; status), and the preview shows every change and every row it couldn't match before
// anything is saved.

export type TfpStatus = "active" | "overdue" | "cancelled";
export type TfpRow = { line: number; firstName: string; lastName: string; email: string | null; statusText: string; status: TfpStatus | null };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9@.]+/g, " ").trim();
const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

const NAME = ["player", "player name", "member", "member name", "child", "child name", "participant", "participant name", "athlete", "name", "full name"];
const FIRST = ["player first name", "child first name", "member first name", "first name", "forename", "firstname"];
const LAST = ["player last name", "child last name", "member last name", "last name", "surname", "lastname"];
const EMAIL = ["parent email", "guardian email", "payer email", "account email", "contact email", "email address", "email", "e mail"];
const STATUS = ["subscription status", "payment status", "plan status", "mandate status", "membership status", "status"];

/** What a TeamFeePay status means for the club's monthly plan; null when it isn't recognised (listed, not applied). */
export function readTfpStatus(text: string): TfpStatus | null {
  const t = norm(text);
  if (!t) return null;
  if (/fail|overdue|arrear|late|unpaid|missed|declin|outstanding|bounced|retry/.test(t)) return "overdue";
  if (/cancel|inactive|ended|expired|stopp|paused|suspend|lapsed|left|closed/.test(t)) return "cancelled";
  if (/active|live|paid|current|up to date|good standing|subscribed|success|confirmed|ok/.test(t)) return "active";
  return null;
}

export type TfpParse = { rows: TfpRow[]; problem: string | null };

export function parseTeamFeePay(csv: string): TfpParse {
  const table = parseCsv(csv).filter((r) => r.some((c) => c.trim() !== ""));
  if (table.length < 2) return { rows: [], problem: "That file has no rows under the header." };
  const header = table[0].map(norm);
  const find = (names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const first = find(FIRST);
  const last = find(LAST);
  const name = first >= 0 && last >= 0 ? -1 : find(NAME);
  const email = find(EMAIL);
  const status = find(STATUS);
  if (status < 0) return { rows: [], problem: "Couldn't find a Status column. Export the members list from TeamFeePay with each member's status." };
  if (name < 0 && (first < 0 || last < 0)) return { rows: [], problem: "Couldn't find the child's name. The file needs a Name column, or First name and Last name." };
  const rows = table.slice(1).map((cells, i): TfpRow => {
    const cell = (j: number) => (j >= 0 ? (cells[j] ?? "").trim() : "");
    let firstName = cell(first);
    let lastName = cell(last);
    if (name >= 0) {
      const parts = cell(name).split(/\s+/).filter(Boolean);
      firstName = parts[0] ?? "";
      lastName = parts.slice(1).join(" ");
    }
    const mail = cell(email).toLowerCase();
    return { line: i + 2, firstName, lastName, email: mail.includes("@") ? mail : null, statusText: cell(status), status: readTfpStatus(cell(status)) };
  });
  return { rows, problem: null };
}

export type TfpChange = { line: number; playerId: string; child: string; from: PaymentState; to: PaymentState; byEmail: boolean };
export type TfpSkip = { line: number; who: string; reason: string };
export type TfpPlan = { changes: TfpChange[]; unchanged: number; skipped: TfpSkip[] };

/** What the rows would change, matched against the club's children (run as the admin). Nothing is written. */
export async function planTeamFeePay(tx: Queryable, rows: TfpRow[]): Promise<TfpPlan> {
  const children = await tx.query<{ id: string; first_name: string; last_name: string; state: PaymentState; emails: string[] | null }>(
    `select p.id, p.first_name, p.last_name, coalesce(ps.state::text, 'missing') as state,
       (select array_agg(lower(g.email)) from player_guardians pg join guardians g on g.id = pg.guardian_id where pg.player_id = p.id and g.email is not null) as emails
     from players p left join payment_status ps on ps.player_id = p.id`,
  );
  const byName = new Map<string, typeof children>();
  for (const c of children) {
    const k = key(`${c.first_name}${c.last_name}`);
    byName.set(k, [...(byName.get(k) ?? []), c]);
  }
  const plan: TfpPlan = { changes: [], unchanged: 0, skipped: [] };
  const seen = new Map<string, number>();
  for (const r of rows) {
    const who = `${r.firstName} ${r.lastName}`.trim() || r.email || `Row ${r.line}`;
    if (!r.status) {
      plan.skipped.push({ line: r.line, who, reason: r.statusText ? `Status "${r.statusText}" not recognised` : "No status" });
      continue;
    }
    let match = byName.get(key(`${r.firstName}${r.lastName}`)) ?? [];
    let byEmail = false;
    if (match.length > 1 && r.email) match = match.filter((c) => (c.emails ?? []).includes(r.email!));
    if (match.length === 0 && r.email) {
      // Name spelt differently: the parent's email, when it leads to one child with that first name (or their only child).
      const family = children.filter((c) => (c.emails ?? []).includes(r.email!));
      const sameFirst = family.filter((c) => key(c.first_name) === key(r.firstName));
      match = sameFirst.length === 1 ? sameFirst : family.length === 1 ? family : [];
      byEmail = match.length === 1;
    }
    if (match.length === 0) {
      plan.skipped.push({ line: r.line, who, reason: "No child with this name in the app" });
      continue;
    }
    if (match.length > 1) {
      plan.skipped.push({ line: r.line, who, reason: "More than one child with this name: add the parent's email to the file" });
      continue;
    }
    const child = match[0];
    if (seen.has(child.id)) {
      plan.skipped.push({ line: r.line, who, reason: `Same child as row ${seen.get(child.id)}` });
      continue;
    }
    seen.set(child.id, r.line);
    const to = nextState(child.state, r.status);
    if (to === child.state) plan.unchanged++;
    else plan.changes.push({ line: r.line, playerId: child.id, child: `${child.first_name} ${child.last_name}`, from: child.state, to, byEmail });
  }
  return plan;
}

/**
 * A TeamFeePay status applied to the plan the app has. Active → monthly plan (active); overdue → overdue; cancelled →
 * no plan, unless the family pays as they go (a cancelled monthly plan doesn't change that) or already had none.
 */
export function nextState(current: PaymentState, status: TfpStatus): PaymentState {
  if (status === "active") return "active";
  if (status === "overdue") return "overdue";
  return current === "pay_as_you_go" || current === "missing" ? current : "missing";
}

export async function applyTeamFeePay(tx: Queryable, changes: TfpChange[], now: Date): Promise<number> {
  for (const c of changes) {
    await tx.query(
      `insert into payment_status (player_id, provider, state, synced_at, updated_at) values ($1, 'teamfeepay', $2::text::payment_state, $3, $3)
       on conflict (player_id) do update set provider = 'teamfeepay', state = excluded.state, synced_at = excluded.synced_at, updated_at = excluded.updated_at`,
      [c.playerId, c.to, now],
    );
  }
  return changes.length;
}

/** When the last TeamFeePay file was applied (any plan synced from it), for "Last imported 12 Oct". */
export async function lastTeamFeePaySync(tx: Queryable): Promise<Date | null> {
  const [row] = await tx.query<{ at: Date | null }>(`select max(synced_at) as at from payment_status where provider = 'teamfeepay'`);
  return row?.at ? new Date(row.at) : null;
}
