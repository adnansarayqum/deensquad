import type { FamiliesFilter } from "@/lib/admin/families-link";

/**
 * The Families list's filters as hidden fields, for a form whose action redirects (read back with
 * `familiesFilterFromForm`), so the admin comes back to the same filtered list.
 */
export function FamiliesFilterFields({ filter: { group, need, q } }: { filter: FamiliesFilter }) {
  return (
    <>
      {group ? <input type="hidden" name="group" value={group} /> : null}
      {need ? <input type="hidden" name="need" value={need} /> : null}
      {q ? <input type="hidden" name="q" value={q} /> : null}
    </>
  );
}
