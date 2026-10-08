import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Upload } from "lucide-react";
import { Notice, PageHeader } from "@/components/admin/bits";
import { Pill } from "@/components/ui";
import { countBehindOnNews, countUninvited, loadFamilies, type FamilyRow } from "@/lib/admin/data";
import { familiesFilter, familiesHref, familiesInviteHref, familiesScope, familyChildHref } from "@/lib/admin/families-link";
import { NEEDS, type Need } from "@/lib/admin/needs";
import { requireStaff, staffGroups } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { groupPlural } from "@/lib/domain";

export const metadata: Metadata = { title: "Families" };

function appStatus(f: FamilyRow): "in" | "invited" | "not" {
  return f.inApp ? "in" : f.guardians.some((g) => g.invited) ? "invited" : "not";
}

export default async function FamiliesPage({ searchParams }: PageProps<"/admin/families">) {
  const user = await requireStaff();
  const params = await searchParams;
  const mine = staffGroups(user.staff);
  const filter = familiesFilter(params, mine);
  const { group, need, q } = filter;
  const isAdmin = user.staff.role === "admin";
  // Invites go to the parents of the children in this list, so the banner counts just those.
  const [families, notInvited, behind] = await asUser(user.id, (tx) =>
    Promise.all([
      loadFamilies(tx, group, mine, { need, search: q || null }),
      isAdmin ? countUninvited(tx, { group, need, search: q || null }, mine) : Promise.resolve(0),
      // "Unread" is about parents: the overview counts them, so the list says how many as well as their children.
      need === "unread" ? countBehindOnNews(tx, { group, need, search: q || null }, mine) : Promise.resolve(null),
    ]),
  );
  const filtered = need !== null || q !== "";

  return (
    <>
      <PageHeader
        title="Families"
        actions={
          isAdmin ? (
            <Link href="/admin/families/import" className="btn-chunky btn-paper btn-small">
              <Upload aria-hidden size={16} />
              Import families
            </Link>
          ) : null
        }
      />

      {params.invited && params.notSent ? (
        <Notice tone="action">{`Sent to ${params.invited}. ${params.notSent} not sent – try again later.`}</Notice>
      ) : params.invited ? (
        <Notice>
          {params.invited === "0"
            ? "Everyone in this list has already been invited."
            : `Invites sent to ${params.invited} ${params.invited === "1" ? "parent" : "parents"}.`}
        </Notice>
      ) : null}
      {params.invite === "no-email" ? <Notice tone="action">Email isn&apos;t set up yet. Add RESEND_API_KEY in Railway, then send the invites.</Notice> : null}
      {params.invite === "no-url" ? <Notice tone="action">Set APP_URL in Railway to the app&apos;s web address, then send the invites.</Notice> : null}
      {params.removed ? <Notice>Removed.</Notice> : null}

      {isAdmin && notInvited > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-app bg-gold-tint px-4 py-3">
          <p className="text-[15px]">
            <b>{notInvited}</b> {notInvited === 1 ? "parent" : "parents"} {familiesScope(filter)} {notInvited === 1 ? "hasn't" : "haven't"} had an invite
            yet.
          </p>
          {/* Opens a confirmation that names the count; nothing is sent from here. */}
          <Link href={familiesInviteHref(filter)} className="btn-chunky btn-grass btn-small">
            Email invites
          </Link>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <nav aria-label="Groups" className="flex flex-wrap gap-2">
          {[null, ...mine].map((g) => (
            <Link
              key={g ?? "all"}
              href={familiesHref({ group: g, need, q })}
              aria-current={g === group ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-pill border-2 px-4 text-sm font-extrabold ${
                g === group ? "border-grass bg-grass-tint text-grass-text" : "border-line bg-paper text-ink"
              }`}
            >
              {g ?? "All"}
            </Link>
          ))}
        </nav>

        {/* A plain GET form: the filters live in the address, so the overview can link straight to them. */}
        <form action="/admin/families" role="search" aria-label="Find families" className="flex flex-wrap items-end gap-2">
          {group ? <input type="hidden" name="group" value={group} /> : null}
          <div className="min-w-0 flex-1 lg:w-56 lg:flex-none">
            <label htmlFor="q" className="field-label">
              Child or parent name
            </label>
            <input id="q" name="q" type="search" defaultValue={q} maxLength={60} className="field" autoComplete="off" />
          </div>
          <div className="min-w-0 flex-1 lg:w-56 lg:flex-none">
            <label htmlFor="need" className="field-label">
              Show
            </label>
            <select id="need" name="need" defaultValue={need ?? ""} className="field">
              <option value="">Every child</option>
              {(Object.keys(NEEDS) as Need[]).map((n) => (
                <option key={n} value={n}>
                  {NEEDS[n].label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-chunky btn-paper btn-small">
            Find
          </button>
        </form>
      </div>

      {filtered ? (
        <p role="status" className="flex flex-wrap items-center gap-x-3 text-[15px]">
          {behind !== null ? (
            <span>
              <b className="tabular-nums">{behind}</b> {behind === 1 ? "parent hasn't" : "parents haven't"} tapped &ldquo;I&apos;ve read this&rdquo; on 2 or
              more messages · their {families.length === 1 ? "child" : `${families.length} children`}
              {q ? ` · matching “${q}”` : ""}
            </span>
          ) : (
            <span>
              <b className="tabular-nums">{families.length}</b> {families.length === 1 ? "child" : "children"}
              {need ? ` · ${NEEDS[need].label.toLowerCase()}` : ""}
              {q ? ` · matching “${q}”` : ""}
            </span>
          )}
          <Link href={familiesHref({ group, need: null, q: "" })} className="inline-flex min-h-11 items-center font-bold text-grass-text underline">
            Show everyone
          </Link>
        </p>
      ) : null}

      {families.length === 0 ? (
        <p className="rounded-app border-2 border-line bg-paper p-4 text-[15px]">
          {filtered
            ? "No children match."
            : group
              ? `No players in the ${groupPlural(group)}.`
              : "No families yet. Import them from a spreadsheet to get started."}
        </p>
      ) : (
        <>
          {/* Phones: one card per child. */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {families.map((f) => {
              const parents = f.guardians.map((g) => g.name).join(", ");
              const status = appStatus(f);
              return (
                <li key={f.id}>
                  <Link href={familyChildHref(f.id, filter)} className="flex items-center gap-3 rounded-app border-2 border-line bg-paper px-3.5 py-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-pill bg-pitch font-display text-[20px] text-on-pitch">
                      {f.shirtNumber ?? f.firstName[0]}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-[15px] font-bold">
                        {f.firstName} {f.lastName} <span className="font-normal text-ink-muted">· {f.ageGroup}</span>
                      </span>
                      <span className="truncate text-[13px] text-ink-muted">{parents || "No parent linked"}</span>
                      <span className="flex flex-wrap gap-1.5">
                        {status === "in" ? <Pill tone="done">Signed in</Pill> : status === "invited" ? <Pill tone="gold">Invited</Pill> : <Pill tone="neutral">Not invited</Pill>}
                        {f.payment === "missing" || f.payment === "overdue" ? (
                          <Pill tone="action">{f.payment === "overdue" ? "Payment overdue" : "No payment plan"}</Pill>
                        ) : f.payment === "self_reported" ? (
                          <Pill tone="gold">Payment to check</Pill>
                        ) : null}
                        {f.consent === null ? <Pill tone="action">No photo answer</Pill> : null}
                        {f.contacts === 0 ? <Pill tone="action">No emergency contact</Pill> : null}
                        {!f.agreed ? <Pill tone="action">Contract not signed</Pill> : null}
                      </span>
                    </span>
                    <ChevronRight aria-hidden size={20} className="shrink-0 text-ink-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Computers: a table, one row per child. */}
          <div className="hidden overflow-x-auto rounded-dash border-2 border-line bg-paper lg:block">
            <table className="w-full text-[14px]">
              <caption className="sr-only">Children{group ? ` in the ${groupPlural(group)}` : ""}, their parents and what they still need</caption>
              <thead>
                <tr className="border-b-2 border-line text-left text-label text-ink-muted uppercase">
                  <th scope="col" className="px-3 py-2.5 font-bold">
                    Child
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-bold">
                    Group
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-bold">
                    Parents
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-bold">
                    App
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-bold">
                    Payment
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-bold">
                    Photos
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-bold">
                    Emergency contact
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-bold">
                    Contract
                  </th>
                </tr>
              </thead>
              <tbody>
                {families.map((f) => {
                  const status = appStatus(f);
                  return (
                    <tr key={f.id} className="border-t border-line align-middle hover:bg-cream">
                      <th scope="row" className="px-3 text-left">
                        <Link href={familyChildHref(f.id, filter)} className="flex min-h-12 items-center font-bold underline decoration-line underline-offset-4">
                          {f.firstName} {f.lastName}
                        </Link>
                      </th>
                      <td className="px-3 tabular-nums">{f.ageGroup}</td>
                      <td className="max-w-56 px-3 text-ink-muted">{f.guardians.map((g) => g.name).join(", ") || "No parent linked"}</td>
                      <td className="px-3">
                        {status === "in" ? <Pill tone="done">Signed in</Pill> : status === "invited" ? <Pill tone="gold">Invited</Pill> : <Pill tone="neutral">Not invited</Pill>}
                      </td>
                      <td className="px-3">
                        {f.payment === "active" ? (
                          <Pill tone="done">Plan active</Pill>
                        ) : f.payment === "self_reported" ? (
                          <Pill tone="gold">To check</Pill>
                        ) : f.payment === "overdue" ? (
                          <Pill tone="action">Overdue</Pill>
                        ) : (
                          <Pill tone="action">No plan</Pill>
                        )}
                      </td>
                      <td className="px-3">
                        {f.consent === null ? <Pill tone="action">No answer</Pill> : f.consent ? <Pill tone="done">Yes</Pill> : <Pill tone="neutral">No photos</Pill>}
                      </td>
                      <td className="px-3">{f.contacts === 0 ? <Pill tone="action">None</Pill> : <Pill tone="done">{f.contacts} added</Pill>}</td>
                      <td className="px-3">{f.agreed ? <Pill tone="done">Signed</Pill> : <Pill tone="action">Not signed</Pill>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
