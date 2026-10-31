import { CONTACT_IS_PARENT } from "../contacts-sql";
import { CONTRACT } from "../documents/contract";
import type { Queryable } from "../db/types";
import { loadSessionTotals, TOTAL_GROUPS } from "../admin/session-totals";

// The spreadsheets admins can download. Each runs as the admin (row level security on).

export const EXPORTS = {
  families: { label: "Families and payments", detail: "Every child with their parents, contact details, payment, consent and contract status" },
  attendance: { label: "Attendance", detail: "Every check-in this season, one row per child per session, with each session's totals by group" },
  "session-totals": {
    label: "Session totals",
    detail: "One row per session this season: how many came in each group and in all, how many pay per session, and what was taken at the gate (card and cash)",
  },
  orders: { label: "Shop orders", detail: "Every item ordered, with payment and collection status" },
  awards: { label: "Points, stars and badges", detail: "Each child's totals this season" },
  "gate-payments": { label: "Paid at the gate", detail: "Every session fee taken at the gate this season (pay as you go and trials)" },
} as const;

export type ExportKind = keyof typeof EXPORTS;

export function isExportKind(v: unknown): v is ExportKind {
  return typeof v === "string" && v in EXPORTS;
}

const london = (d: Date | string | null) =>
  d ? new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/London" }).format(new Date(d)) : "";
const day = (d: Date | string | null) => (d ? new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeZone: "Europe/London" }).format(new Date(d)) : "");
const pounds = (pence: number) => (pence / 100).toFixed(2);

/** 1 August, the start of the football season the date falls in. */
export function seasonStart(now: Date): Date {
  const year = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return new Date(Date.UTC(year, 7, 1));
}

export async function buildExport(tx: Queryable, kind: ExportKind, now: Date): Promise<{ header: string[]; rows: unknown[][] }> {
  switch (kind) {
    case "families": {
      const rows = await tx.query<{
        first_name: string;
        last_name: string;
        age_group: string;
        date_of_birth: string | null;
        shirt_number: number | null;
        payment: string;
        photo_consent: boolean | null;
        contacts: number;
        signed_by: string | null;
        signed_at: Date | null;
        parents: string | null;
        emails: string | null;
        phones: string | null;
        in_app: boolean;
      }>(
        `select p.first_name, p.last_name, p.age_group::text as age_group, p.date_of_birth::text as date_of_birth, p.shirt_number,
           coalesce(ps.state::text, 'missing') as payment, p.photo_consent,
           (select count(*)::int from emergency_contacts ec where ec.player_id = p.id and not ${CONTACT_IS_PARENT}) as contacts,
           ag.parent_name as signed_by, ag.signed_at,
           string_agg(g.first_name || ' ' || g.last_name, '; ' order by g.first_name) as parents,
           string_agg(g.email, '; ' order by g.first_name) as emails,
           string_agg(g.phone, '; ' order by g.first_name) as phones,
           coalesce(bool_or(g.auth_user_id is not null), false) as in_app
         from players p
         left join payment_status ps on ps.player_id = p.id
         left join agreements ag on ag.player_id = p.id and ag.document = $1
         left join player_guardians pg on pg.player_id = p.id
         left join guardians g on g.id = pg.guardian_id
         group by p.id, ps.state, ag.parent_name, ag.signed_at
         order by p.age_group, p.last_name, p.first_name`,
        [CONTRACT.id],
      );
      const payment: Record<string, string> = { active: "Active", missing: "No plan", overdue: "Overdue", self_reported: "Parent says set up", pay_as_you_go: "Pay as you go" };
      return {
        header: ["Child first name", "Child last name", "Group", "Date of birth", "Shirt", "Parents", "Emails", "Phones", "In the app", "Payment", "Photo consent", "Emergency contacts", "Contract signed by", "Contract signed on"],
        rows: rows.map((r) => [
          r.first_name,
          r.last_name,
          r.age_group,
          r.date_of_birth ? day(r.date_of_birth) : "",
          r.shirt_number ?? "",
          r.parents ?? "",
          r.emails ?? "",
          r.phones ?? "",
          r.in_app ? "Yes" : "No",
          payment[r.payment] ?? r.payment,
          r.photo_consent === null ? "Not answered" : r.photo_consent ? "Yes" : "No",
          r.contacts,
          r.signed_by ?? "Not signed",
          day(r.signed_at),
        ]),
      };
    }
    case "attendance": {
      const rows = await tx.query<{ starts_at: Date; title: string; first_name: string; last_name: string; age_group: string; checked_in_at: Date; method: string }>(
        `select s.starts_at, s.title, p.first_name, p.last_name, p.age_group::text as age_group, a.checked_in_at, a.method
         from attendance a join sessions s on s.id = a.session_id join players p on p.id = a.player_id
         where s.starts_at >= $1
         order by s.starts_at, p.age_group, p.last_name, p.first_name`,
        [seasonStart(now)],
      );
      // After each session's children, its totals: one line per group and one for the session, worked out here rather
      // than as spreadsheet formulas (a cell starting "=" is defused, see csv.ts), so they're right in any program.
      const out: unknown[][] = [];
      const flush = (date: string, title: string, counts: Map<string, number>) => {
        let all = 0;
        for (const g of TOTAL_GROUPS) {
          const n = counts.get(g) ?? 0;
          if (!n) continue;
          all += n;
          out.push([date, title, g, `Total ${g}`, "", n, ""]);
        }
        out.push([date, title, "All groups", "Total for the session", "", all, ""]);
        out.push(["", "", "", "", "", "", ""]);
      };
      let key = "";
      let counts = new Map<string, number>();
      let last: { date: string; title: string } | null = null;
      for (const r of rows) {
        const k = `${new Date(r.starts_at).toISOString()}|${r.title}`;
        if (last && k !== key) {
          flush(last.date, last.title, counts);
          counts = new Map();
        }
        key = k;
        last = { date: day(r.starts_at), title: r.title };
        counts.set(r.age_group, (counts.get(r.age_group) ?? 0) + 1);
        out.push([day(r.starts_at), r.title, r.age_group, r.first_name, r.last_name, london(r.checked_in_at), r.method === "qr" ? "QR code" : "Marked by coach"]);
      }
      if (last) flush(last.date, last.title, counts);
      return {
        header: ["Session date", "Session", "Group", "Child first name", "Child last name", "Checked in", "How"],
        rows: out,
      };
    }
    case "session-totals": {
      const sessions = await loadSessionTotals(tx, { from: seasonStart(now) });
      const sum = (f: (t: (typeof sessions)[number]) => number) => sessions.reduce((a, t) => a + f(t), 0);
      const line = (t: (typeof sessions)[number]) => [
        ...TOTAL_GROUPS.map((g) => t.byGroup[g]),
        t.total,
        t.trialsCame,
        t.payAsYouGo,
        t.noPlanYet,
        t.payAsYouGo + t.noPlanYet + t.trialsCame,
        t.paidCount,
        pounds(t.cardPence),
        pounds(t.cashPence),
        pounds(t.cardPence + t.cashPence),
      ];
      return {
        header: [
          "Session date",
          "Session",
          ...TOTAL_GROUPS.map((g) => `${g} came`),
          "Total came",
          "Trials who came",
          "Pay as you go who came",
          "No payment plan yet who came",
          "Should pay at the gate (with trials)",
          "Paid at the gate (children and trials)",
          "Taken by card (£)",
          "Taken in cash (£)",
          "Taken at the gate (£)",
        ],
        rows: [
          ...sessions.map((t) => [day(t.startsAt), t.title, ...line(t)]),
          ...(sessions.length
            ? [
                Array.from({ length: TOTAL_GROUPS.length + 11 }, () => ""),
                [
                  "Season so far",
                  `${sessions.length} sessions`,
                  ...TOTAL_GROUPS.map((g) => sum((t) => t.byGroup[g])),
                  sum((t) => t.total),
                  sum((t) => t.trialsCame),
                  sum((t) => t.payAsYouGo),
                  sum((t) => t.noPlanYet),
                  sum((t) => t.payAsYouGo + t.noPlanYet + t.trialsCame),
                  sum((t) => t.paidCount),
                  pounds(sum((t) => t.cardPence)),
                  pounds(sum((t) => t.cashPence)),
                  pounds(sum((t) => t.cardPence + t.cashPence)),
                ],
              ]
            : []),
        ],
      };
    }
    case "orders": {
      const rows = await tx.query<{
        id: string;
        created_at: Date;
        parent: string | null;
        email: string | null;
        status: string;
        pay_by: string;
        paid_at: Date | null;
        product_name: string;
        child: string | null;
        size: string | null;
        initials: string | null;
        quantity: number;
        line_pence: number;
      }>(
        `select o.id, o.created_at, g.first_name || ' ' || g.last_name as parent, g.email, o.status::text as status, o.pay_by, o.paid_at,
           i.product_name, p.first_name || ' ' || p.last_name as child, i.size, i.initials, i.quantity,
           (i.quantity * (i.unit_pence + i.initials_pence))::int as line_pence
         from shop_orders o join shop_order_items i on i.order_id = o.id
         left join guardians g on g.id = o.guardian_id left join players p on p.id = i.player_id
         where not (o.status = 'awaiting_payment' and o.pay_by = 'card')
         order by o.created_at, o.id, i.product_name`,
      );
      const status: Record<string, string> = { awaiting_payment: "Not paid yet", paid: "Paid", ordered: "Ordered", ready: "Ready", collected: "Picked up", cancelled: "Cancelled" };
      return {
        header: ["Order", "Ordered on", "Parent", "Email", "Status", "Paid by", "Paid on", "Item", "For", "Size", "Initials", "Quantity", "Line total (£)"],
        rows: rows.map((r) => [
          `DS-${r.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
          london(r.created_at),
          r.parent ?? "",
          r.email ?? "",
          status[r.status] ?? r.status,
          r.pay_by === "bank" ? "Bank transfer" : "Card",
          day(r.paid_at),
          r.product_name,
          r.child ?? "",
          r.size ?? "",
          r.initials ?? "",
          r.quantity,
          pounds(r.line_pence),
        ]),
      };
    }
    case "gate-payments": {
      const rows = await tx.query<{
        starts_at: Date;
        title: string;
        first_name: string;
        last_name: string;
        age_group: string;
        trial: boolean;
        amount_pence: number;
        method: string;
        taken_at: Date;
        taken_by: string | null;
      }>(
        `select s.starts_at, s.title,
           coalesce(p.first_name, t.child_first_name) as first_name, coalesce(p.last_name, t.child_last_name) as last_name,
           coalesce(p.age_group, t.age_group)::text as age_group, t.id is not null as trial,
           sp.amount_pence, sp.method, sp.taken_at, sn.display_name as taken_by
         from session_payments sp join sessions s on s.id = sp.session_id
         left join players p on p.id = sp.player_id
         left join trial_bookings t on t.id = sp.trial_id
         left join staff_names sn on sn.id = sp.taken_by
         where s.starts_at >= $1
         order by s.starts_at, age_group, last_name, first_name`,
        [seasonStart(now)],
      );
      return {
        header: ["Session date", "Session", "Group", "Child first name", "Child last name", "Trial", "Amount (£)", "How", "Taken", "Taken by"],
        rows: rows.map((r) => [
          day(r.starts_at),
          r.title,
          r.age_group,
          r.first_name,
          r.last_name,
          r.trial ? "Trial" : "",
          pounds(r.amount_pence),
          r.method === "cash" ? "Cash" : "Card",
          london(r.taken_at),
          r.taken_by ?? "",
        ]),
      };
    }
    case "awards": {
      const rows = await tx.query<{ first_name: string; last_name: string; age_group: string; points: number; stars: number; badges: string | null }>(
        `select p.first_name, p.last_name, p.age_group::text as age_group,
           coalesce((select sum(points) from player_awards a where a.player_id = p.id and a.created_at >= $1), 0)::int as points,
           coalesce((select sum(stars) from player_awards a where a.player_id = p.id and a.created_at >= $1), 0)::int as stars,
           (select string_agg(b.name, '; ' order by b.name) from player_badges pb join badges b on b.id = pb.badge_id where pb.player_id = p.id) as badges
         from players p order by p.age_group, points desc, p.last_name`,
        [seasonStart(now)],
      );
      return {
        header: ["Child first name", "Child last name", "Group", "Points", "Stars", "Badges"],
        rows: rows.map((r) => [r.first_name, r.last_name, r.age_group, r.points, r.stars, r.badges ?? ""]),
      };
    }
  }
}
