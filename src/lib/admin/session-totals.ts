import type { Queryable } from "../db/types";
import { AGE_GROUPS, type AgeGroup } from "../domain";

/**
 * A session's night in numbers, for the admin's tally (the owner's request, Oct 2026): how many children came in each
 * group and in all, trials who came, how many of those who came pay per session (pay as you go, or no plan yet, the
 * same families the register asks to pay at the gate), and what was taken at the gate, card and cash apart, so it can
 * be checked against the card machine. Shared by the "Session totals" spreadsheet and the session's Totals page.
 */
export type SessionTotals = {
  id: string;
  title: string;
  startsAt: Date;
  byGroup: Record<AgeGroup, number>;
  total: number;
  trialsCame: number;
  payAsYouGo: number;
  noPlanYet: number;
  paidCount: number;
  cardPence: number;
  cashPence: number;
};

/** The groups the club runs now, in club order (the old U9/U11/U13 values aren't offered). */
export const TOTAL_GROUPS = AGE_GROUPS;

/** Sessions that have started since `from` (or the given ones), with at least one check-in, trial arrival or payment. */
export async function loadSessionTotals(tx: Queryable, opts: { from?: Date; ids?: string[] }): Promise<SessionTotals[]> {
  const rows = await tx.query<{
    id: string;
    title: string;
    starts_at: Date;
    groups: { g: string; n: number }[] | null;
    total: number;
    trials_came: number;
    payg: number;
    no_plan: number;
    paid_count: number;
    card_pence: number;
    cash_pence: number;
  }>(
    `with s as (
       select id, title, starts_at from sessions
       where ($2::uuid[] is not null or starts_at <= now())
         and ($1::timestamptz is null or starts_at >= $1)
         and ($2::uuid[] is null or id = any($2::uuid[]))
     ),
     came as (
       select a.session_id, p.age_group::text as g, coalesce(ps.state::text, 'missing') as state
       from attendance a join s on s.id = a.session_id join players p on p.id = a.player_id
       left join payment_status ps on ps.player_id = p.id
     )
     select s.id, s.title, s.starts_at,
       (select json_agg(json_build_object('g', g, 'n', n)) from (select g, count(*)::int as n from came where came.session_id = s.id group by g) x) as groups,
       (select count(*)::int from came where came.session_id = s.id) as total,
       (select count(*)::int from trial_bookings t where t.session_id = s.id and t.arrived_at is not null) as trials_came,
       (select count(*)::int from came where came.session_id = s.id and came.state = 'pay_as_you_go') as payg,
       (select count(*)::int from came where came.session_id = s.id and came.state = 'missing') as no_plan,
       (select count(*)::int from session_payments sp where sp.session_id = s.id) as paid_count,
       (select coalesce(sum(amount_pence), 0)::int from session_payments sp where sp.session_id = s.id and sp.method = 'card') as card_pence,
       (select coalesce(sum(amount_pence), 0)::int from session_payments sp where sp.session_id = s.id and sp.method = 'cash') as cash_pence
     from s
     order by s.starts_at`,
    [opts.from ?? null, opts.ids ?? null],
  );
  return rows
    .filter((r) => r.total > 0 || r.trials_came > 0 || r.paid_count > 0)
    .map((r) => {
      const byGroup = Object.fromEntries(TOTAL_GROUPS.map((g) => [g, 0])) as Record<AgeGroup, number>;
      for (const { g, n } of r.groups ?? []) if (g in byGroup) byGroup[g as AgeGroup] = n;
      return {
        id: r.id,
        title: r.title,
        startsAt: new Date(r.starts_at),
        byGroup,
        total: r.total,
        trialsCame: r.trials_came,
        payAsYouGo: r.payg,
        noPlanYet: r.no_plan,
        paidCount: r.paid_count,
        cardPence: r.card_pence,
        cashPence: r.cash_pence,
      };
    });
}

/** Children who came, pay per session and have no payment recorded for that session: who to check with. */
export async function loadUnpaidAtGate(tx: Queryable, sessionId: string): Promise<{ id: string; name: string; group: string; plan: "pay_as_you_go" | "missing" }[]> {
  const rows = await tx.query<{ id: string; first_name: string; last_name: string; age_group: string; state: string }>(
    `select p.id, p.first_name, p.last_name, p.age_group::text as age_group, coalesce(ps.state::text, 'missing') as state
     from attendance a join players p on p.id = a.player_id
     left join payment_status ps on ps.player_id = p.id
     where a.session_id = $1
       and coalesce(ps.state::text, 'missing') in ('pay_as_you_go', 'missing')
       and not exists (select 1 from session_payments sp where sp.session_id = a.session_id and sp.player_id = p.id)
     order by p.age_group, p.first_name, p.last_name`,
    [sessionId],
  );
  return rows.map((r) => ({ id: r.id, name: `${r.first_name} ${r.last_name}`, group: r.age_group, plan: r.state === "pay_as_you_go" ? "pay_as_you_go" : "missing" }));
}
