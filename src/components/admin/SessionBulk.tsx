"use client";

import { useEffect, useRef, useState } from "react";

// The bulk bar and "Select all" boxes on Admin → Sessions. The list is one plain form (`openBulk` in
// lib/admin/actions.ts) whose checkboxes are named `ids`; the bar's buttons send `do=edit|cancel|restore|delete`.
// Without JavaScript the bar is always there and Select all does nothing; with it the bar shows only once
// something is ticked, with a live count, and Select all ticks every box in its own table or card list.

const IDS = 'input[type="checkbox"][name="ids"]';

/** Distinct ids ticked in the form (the phone cards and the lg table both carry a box per session). */
function tickedCount(form: HTMLFormElement): number {
  return new Set(Array.from(form.querySelectorAll<HTMLInputElement>(`${IDS}:checked`)).map((i) => i.value)).size;
}

/** A row's checkbox: a 48px target, named for the session. */
export function SelectRow({ id, name }: { id: string; name: string }) {
  return (
    <label className="flex min-h-12 min-w-12 cursor-pointer items-center justify-center">
      <input type="checkbox" name="ids" value={id} aria-label={name} className="h-5 w-5 accent-[var(--grass)]" />
    </label>
  );
}

/** Ticks or clears every row box in the nearest table or list; follows them (all ticked → ticked). */
export function SelectAll({ label }: { label: string }) {
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = box.current;
    const scope = el?.closest("table, ul");
    if (!el || !scope) return;
    const follow = (e: Event) => {
      // Its own change reaches here (the table's listener) before React's onChange: leave that one to `toggle`.
      if (e.target === el) return;
      const rows = Array.from(scope.querySelectorAll<HTMLInputElement>(IDS));
      const on = rows.filter((r) => r.checked).length;
      el.checked = rows.length > 0 && on === rows.length;
      el.indeterminate = on > 0 && on < rows.length;
    };
    scope.addEventListener("change", follow);
    return () => scope.removeEventListener("change", follow);
  }, []);
  const toggle = () => {
    const el = box.current;
    const scope = el?.closest("table, ul");
    if (!el || !scope) return;
    // Read once: `follow` moves this box along as each row's change event lands.
    const on = el.checked;
    for (const row of scope.querySelectorAll<HTMLInputElement>(IDS)) {
      if (row.checked !== on) {
        row.checked = on;
        row.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    el.checked = on;
    el.indeterminate = false;
  };
  return (
    <label className="flex min-h-12 min-w-12 cursor-pointer items-center justify-center lg:min-w-0">
      <input ref={box} type="checkbox" aria-label={label} onChange={toggle} className="h-5 w-5 accent-[var(--grass)]" />
    </label>
  );
}

/** Sticky at the bottom of the list while it scrolls (like the squad page's footer), so it never covers the last row. */
export function BulkBar() {
  const bar = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    const form = bar.current?.closest("form");
    if (!form) return;
    const update = () => setCount(tickedCount(form));
    update();
    form.addEventListener("change", update);
    return () => form.removeEventListener("change", update);
  }, []);
  if (count === 0) return null;
  // Tighter than the usual chunky button so the four fit one row on a 390px phone (still 48px tall).
  const button = "btn-chunky btn-paper min-h-12 px-3 text-[15px]";
  return (
    <div
      ref={bar}
      role="group"
      aria-label="With the ticked sessions"
      className="sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-b-app border-t-2 border-line bg-paper px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)]"
    >
      <span aria-live="polite" className="min-w-24 text-[15px] font-bold tabular-nums">
        {count === null ? "Ticked sessions:" : `${count} selected`}
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        <button type="submit" name="do" value="edit" className={button}>
          Edit
        </button>
        <button type="submit" name="do" value="cancel" className={button}>
          Cancel
        </button>
        <button type="submit" name="do" value="restore" className={button}>
          Restore
        </button>
        <button type="submit" name="do" value="delete" className={`${button} border-kit-orange`}>
          Delete
        </button>
      </span>
    </div>
  );
}
