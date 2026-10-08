import type { Queryable } from "../db/types";
import { iso } from "../db/types";
import { seasonStart } from "../exports/reports";
import { orderReference } from "../shop/data";

// "Download my data" (Player → Your data, GET /api/me/export): what the club holds about a parent and their
// children, as one JSON file. Runs as the parent (row level security on), and every query is also limited to
// the parent's own guardian row and children (my_guardian_id(), my_player_ids()) explicitly: a parent who is
// also staff can read the whole club under row level security, and must still get only their own family.
// Other parents' details (a partner's email or phone, who else answered) are theirs, so they're left out.

const at = (v: Date | string | null) => (v === null ? null : iso(v));

export type FamilyExport = Awaited<ReturnType<typeof buildFamilyExport>>;

export async function buildFamilyExport(tx: Queryable, now: Date) {
  const season = seasonStart(now);
  const [[parent], children, contacts, agreements, payments, availability, attendance, awards, badges, notes, reads, orders, items] =
    await Promise.all([
      tx.query<{ first_name: string; last_name: string; email: string | null; phone: string | null; language: string; created_at: Date; calendar_at: Date | null }>(
        `select first_name, last_name, email, phone, language, created_at, calendar_token_created_at as calendar_at from guardians where id = my_guardian_id()`,
      ),
      tx.query<{
        id: string;
        first_name: string;
        last_name: string;
        date_of_birth: string | null;
        age_group: string;
        shirt_number: number | null;
        position: string | null;
        joined_on: string;
        photo_consent: boolean | null;
        photo_consent_recorded_at: Date | null;
        has_photo: boolean;
        photo_updated_at: Date | null;
        relationship: string | null;
      }>(
        `select p.id, p.first_name, p.last_name, p.date_of_birth::text as date_of_birth, p.age_group::text as age_group, p.shirt_number,
           p.position, p.joined_on::text as joined_on, p.photo_consent, p.photo_consent_recorded_at,
           p.photo_file_id is not null as has_photo, p.photo_updated_at, pg.relationship
         from players p join player_guardians pg on pg.player_id = p.id and pg.guardian_id = my_guardian_id()
         where p.id in (select my_player_ids())
         order by p.date_of_birth nulls last, p.first_name`,
      ),
      tx.query<{ player_id: string; name: string; phone: string; relationship: string | null; created_at: Date }>(
        `select player_id, name, phone, relationship, created_at from emergency_contacts
         where player_id in (select my_player_ids()) order by created_at`,
      ),
      tx.query<{ player_id: string; document: string; parent_name: string; signed_at: Date }>(
        `select player_id, document, parent_name, signed_at from agreements where player_id in (select my_player_ids()) order by signed_at`,
      ),
      tx.query<{ player_id: string; state: string; updated_at: Date }>(
        `select player_id, state::text as state, updated_at from payment_status where player_id in (select my_player_ids())`,
      ),
      tx.query<{ player_id: string; title: string; starts_at: Date; answer: string; answered_at: Date; by_you: boolean }>(
        `select v.player_id, s.title, s.starts_at, v.answer::text as answer, v.answered_at, coalesce(v.answered_by = my_guardian_id(), false) as by_you
         from availability v join sessions s on s.id = v.session_id
         where v.player_id in (select my_player_ids()) and s.starts_at >= $1
         order by s.starts_at`,
        [season],
      ),
      tx.query<{ player_id: string; title: string; starts_at: Date; checked_in_at: Date; method: string }>(
        `select a.player_id, s.title, s.starts_at, a.checked_in_at, a.method
         from attendance a join sessions s on s.id = a.session_id
         where a.player_id in (select my_player_ids()) and s.starts_at >= $1
         order by s.starts_at`,
        [season],
      ),
      tx.query<{ player_id: string; stars: number; points: number; reason: string | null; given_by: string | null; created_at: Date }>(
        `select a.player_id, a.stars, a.points, a.reason, sn.display_name as given_by, a.created_at
         from player_awards a left join staff_names sn on sn.id = a.awarded_by
         where a.player_id in (select my_player_ids()) order by a.created_at`,
      ),
      tx.query<{ player_id: string; name: string; earned_on: string }>(
        `select pb.player_id, b.name, pb.earned_on::text as earned_on from player_badges pb join badges b on b.id = pb.badge_id
         where pb.player_id in (select my_player_ids()) order by pb.earned_on`,
      ),
      tx.query<{ player_id: string; body: string; written_by: string | null; created_at: Date }>(
        `select n.player_id, n.body, sn.display_name as written_by, n.created_at
         from coach_notes n left join staff_names sn on sn.id = n.author
         where n.player_id in (select my_player_ids()) order by n.created_at`,
      ),
      tx.query<{ title: string; posted_at: Date; read_at: Date }>(
        `select a.title, a.posted_at, r.read_at from announcement_reads r join announcements a on a.id = r.announcement_id
         where r.guardian_id = my_guardian_id() order by r.read_at`,
      ),
      tx.query<{ id: string; status: string; pay_by: string; total_pence: number; created_at: Date; paid_at: Date | null; collected_at: Date | null }>(
        `select id, status::text as status, pay_by, total_pence, created_at, paid_at, collected_at from shop_orders
         where guardian_id = my_guardian_id() order by created_at`,
      ),
      tx.query<{ order_id: string; product_name: string; child: string | null; size: string | null; initials: string | null; quantity: number; unit_pence: number; initials_pence: number }>(
        `select i.order_id, i.product_name, case when i.player_id in (select my_player_ids()) then p.first_name end as child,
           i.size, i.initials, i.quantity, i.unit_pence, i.initials_pence
         from shop_order_items i join shop_orders o on o.id = i.order_id left join players p on p.id = i.player_id
         where o.guardian_id = my_guardian_id() order by i.product_name`,
      ),
    ]);

  const forChild = <T extends { player_id: string }>(rows: T[], id: string) => rows.filter((r) => r.player_id === id);
  const pounds = (pence: number) => (pence / 100).toFixed(2);

  return {
    about: "Your information held by The Deen Squad Football Academy's parent app. Availability and attendance are for this season (from 1 August).",
    exportedAt: now.toISOString(),
    seasonFrom: season.toISOString().slice(0, 10),
    you: parent
      ? {
          firstName: parent.first_name,
          lastName: parent.last_name,
          email: parent.email,
          phone: parent.phone,
          language: parent.language,
          addedOn: at(parent.created_at),
          // That a private calendar link exists and when it was made; never the link itself (only its hash is kept).
          calendarLink: parent.calendar_at ? { madeAt: at(parent.calendar_at) } : null,
        }
      : null,
    children: children.map((c) => ({
      firstName: c.first_name,
      lastName: c.last_name,
      dateOfBirth: c.date_of_birth,
      ageGroup: c.age_group,
      shirtNumber: c.shirt_number,
      position: c.position,
      joinedOn: c.joined_on,
      yourRelationship: c.relationship,
      photoConsent: c.photo_consent === null ? "not answered" : c.photo_consent ? "yes" : "no",
      photoConsentRecordedAt: at(c.photo_consent_recorded_at),
      // Whether there's a photo for the coaches and when it was added; not the photo itself (it's on the child's details).
      photoForCoaches: c.has_photo ? `yes, added ${at(c.photo_updated_at)}` : "no",
      payment: payments.find((p) => p.player_id === c.id)?.state ?? "missing",
      contractSignatures: forChild(agreements, c.id).map((a) => ({ document: a.document, signedBy: a.parent_name, signedAt: at(a.signed_at) })),
      emergencyContacts: forChild(contacts, c.id).map((e) => ({ name: e.name, phone: e.phone, relationship: e.relationship, addedAt: at(e.created_at) })),
      availability: forChild(availability, c.id).map((v) => ({
        session: v.title,
        startsAt: at(v.starts_at),
        answer: v.answer,
        answeredAt: at(v.answered_at),
        answeredByYou: v.by_you,
      })),
      attendance: forChild(attendance, c.id).map((a) => ({ session: a.title, startsAt: at(a.starts_at), checkedInAt: at(a.checked_in_at), how: a.method })),
      awards: forChild(awards, c.id).map((a) => ({ stars: a.stars, points: a.points, reason: a.reason, givenBy: a.given_by, givenAt: at(a.created_at) })),
      badges: forChild(badges, c.id).map((b) => ({ badge: b.name, earnedOn: b.earned_on })),
      coachNotes: forChild(notes, c.id).map((n) => ({ note: n.body, writtenBy: n.written_by, writtenAt: at(n.created_at) })),
    })),
    newsRead: reads.map((r) => ({ title: r.title, postedAt: at(r.posted_at), readAt: at(r.read_at) })),
    shopOrders: orders.map((o) => ({
      reference: orderReference(o.id),
      status: o.status,
      payBy: o.pay_by,
      total: pounds(o.total_pence),
      placedAt: at(o.created_at),
      paidAt: at(o.paid_at),
      collectedAt: at(o.collected_at),
      items: items
        .filter((i) => i.order_id === o.id)
        .map((i) => ({
          product: i.product_name,
          forChild: i.child,
          size: i.size,
          initials: i.initials,
          quantity: i.quantity,
          each: pounds(i.unit_pence + i.initials_pence),
        })),
    })),
  };
}
