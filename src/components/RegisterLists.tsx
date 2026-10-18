"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { HeartPulse, Search } from "lucide-react";
import { matchesName } from "@/lib/search";
import { FLAG_WORDS, PAYING_WORDS, type PayingBy, type RegisterFlag } from "@/lib/staff/flags";
import { CheckInButton, UndoCheckInButton } from "./CheckInButton";
import { ChildAvatar } from "./ChildAvatar";
import { Pill } from "./ui";

// The gate register's lists (not here yet, said not coming, here) with a name search that filters them as the
// coach types, on the phone (no request). Mark here and Undo are the same in every view; the counts in the
// headings stay those of the whole list.

export type GateRow = {
  id: string;
  firstName: string;
  lastInitial: string;
  ageGroup: string;
  /** The photo a parent added for the coaches, else initials. */
  photoId: string | null;
  answer: "coming" | "away" | null;
  /** "QR code scanned · 5:58pm" for a child who is here. */
  checkedIn: string | null;
  flags: RegisterFlag[];
  /** The parents added medical and additional needs this member of staff may read. */
  medical: boolean;
  /** Monthly plan or pay as you go: a quiet pill, so the gate knows who pays for the session. */
  paying: PayingBy;
  /** Why the parent said not coming ("poorly"), shown under the name in Said not coming. */
  awayReason: string | null;
};

/** "Monthly plan" / "Pay as you go" beside a child's name: neutral, never kit-orange (nothing to chase). */
export function PayingPill({ paying }: { paying: PayingBy }) {
  return paying ? <Pill tone="neutral">{PAYING_WORDS[paying]}</Pill> : null;
}

/**
 * "Medical info" beside a child's name, for those whose parents added some (and only for staff allowed to read it).
 * Neutral, not kit-orange: it isn't an action. A link to the details on their own page, never the details on the
 * list, which other parents can see over a coach's shoulder at the gate. `from` is the register to come back to.
 */
export function MedicalLink({ id, name, from }: { id: string; name: string; from: string }) {
  return (
    <Link
      href={`/coach/child/${id}/medical?from=${encodeURIComponent(from)}`}
      aria-label={`Medical info for ${name}`}
      // The pill stays small so the row keeps its height; the tap area reaches 48px tall around it.
      className="relative inline-flex items-center gap-1 rounded-pill border border-line bg-cream px-2.5 py-0.5 text-label text-ink uppercase underline-offset-2 after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] hover:underline"
    >
      <HeartPulse aria-hidden size={13} />
      Medical info
    </Link>
  );
}

export function FlagPills({ flags }: { flags: readonly RegisterFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <Pill key={f} tone="action">
          {FLAG_WORDS[f]}
        </Pill>
      ))}
    </span>
  );
}

export function RegisterLists({
  sessionId,
  from,
  open,
  showGroup,
  notHere,
  away,
  here,
  children,
}: {
  sessionId: string;
  /** This register's address, for the way back from a child's medical info. */
  from: string;
  open: boolean;
  /** The "All groups" view: each row says its group. */
  showGroup: boolean;
  notHere: GateRow[];
  away: GateRow[];
  here: GateRow[];
  /** Shown above the Here list (the gate's "needs a word" summary). */
  children?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const id = useId();
  const keep = (rows: GateRow[]) => rows.filter((r) => matchesName(query, r.firstName, r.lastInitial));
  const [n, a, h] = [keep(notHere), keep(away), keep(here)];
  const searching = query.trim() !== "";
  const name = (r: GateRow) => `${r.firstName} ${r.lastInitial}.`;
  /** The child's name, with "Medical info" beside it when there is some (under it on a phone, so Mark here stays on the right). */
  const title = (r: GateRow) => (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-[15px] font-bold">{name(r)}</span>
      <PayingPill paying={r.paying} />
      {r.medical ? <MedicalLink id={r.id} name={name(r)} from={from} /> : null}
    </span>
  );
  const group = (r: GateRow) => (showGroup ? <Pill tone="neutral">{r.ageGroup}</Pill> : null);
  // The same height as before (the 48px button sets it), so the list still to arrive stays on the first screen.
  const face = (r: GateRow) => <ChildAvatar photoId={r.photoId} firstName={r.firstName} lastName={r.lastInitial} size={40} />;

  return (
    <>
      <div className="relative">
        <label htmlFor={id} className="sr-only">
          Find a child
        </label>
        <Search aria-hidden size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted" />
        <input
          id={id}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a child: first name or initial"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className="field min-h-12 pl-10"
        />
      </div>
      {searching && n.length + a.length + h.length === 0 ? (
        <p role="status" className="text-[15px] text-ink-muted">
          No child on this register matches &ldquo;{query.trim()}&rdquo;.
        </p>
      ) : null}

      {notHere.length > 0 ? (
        <section aria-labelledby="register-not-here" className="flex flex-col gap-2.5">
          <h3 id="register-not-here" className="mt-1 text-label text-ink-muted uppercase">
            Not here yet ({notHere.length})
          </h3>
          <ul className="flex flex-col gap-2.5">
            {n.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-line bg-paper py-2.5 pr-3 pl-3">
                <span className="flex min-w-0 flex-1 basis-40 items-center gap-3">
                  {face(r)}
                  <span className="flex flex-col items-start gap-1">
                    {title(r)}
                    <span className="text-[13px] text-ink-muted">{r.answer === "coming" ? "Said they're coming" : "No answer"}</span>
                    {group(r)}
                  </span>
                </span>
                <CheckInButton sessionId={sessionId} playerId={r.id} name={name(r)} disabled={!open} />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="mt-1 text-label text-ink-muted uppercase">Everyone expected is here</p>
      )}

      {away.length > 0 ? (
        <section aria-labelledby="register-away" className="mt-2 flex flex-col gap-2.5">
          <h3 id="register-away" className="text-label text-ink-muted uppercase">
            Said not coming ({away.length})
          </h3>
          <p className="text-[13px] text-ink-muted">If one of them turns up, mark them here.</p>
          <ul className="flex flex-col gap-2.5">
            {a.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-line bg-cream py-2.5 pr-3 pl-3">
                <span className="flex min-w-0 flex-1 basis-40 items-center gap-3">
                  {face(r)}
                  <span className="flex flex-col items-start gap-1">
                    {title(r)}
                    <span className="flex flex-wrap gap-1">
                      <Pill tone="neutral">Said not coming</Pill>
                      {group(r)}
                    </span>
                    {r.awayReason ? <span className="text-[13px] leading-[18px] break-words text-ink-muted">Reason: {r.awayReason}</span> : null}
                  </span>
                </span>
                <CheckInButton sessionId={sessionId} playerId={r.id} name={name(r)} disabled={!open} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {children}

      <section aria-labelledby="register-here" className="mt-2 flex flex-col gap-2.5">
        <h3 id="register-here" className="text-label text-ink-muted uppercase">
          Here ({here.length})
        </h3>
        {here.length === 0 ? (
          <p className="text-[13px] text-ink-muted">{open ? "Nobody checked in yet. Scan a QR code or tap Mark here." : "Nobody checked in yet."}</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {h.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-grass-tint py-2 pr-2 pl-3">
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  {face(r)}
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                    {title(r)}
                    <span className="text-[13px] text-ink-muted">{r.checkedIn}</span>
                    {showGroup || r.flags.length ? (
                      <span className="flex flex-wrap gap-1">
                        {group(r)}
                        <FlagPills flags={r.flags} />
                      </span>
                    ) : null}
                  </span>
                </span>
                <UndoCheckInButton sessionId={sessionId} playerId={r.id} name={name(r)} disabled={!open} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
