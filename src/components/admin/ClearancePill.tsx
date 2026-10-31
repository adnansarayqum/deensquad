import { Pill } from "@/components/ui";
import type { StaffClearance } from "@/lib/staff-checks/checks";

/** A member of staff's checks in one pill: "Checks up to date" in grass, anything else ("No DBS recorded", "DBS ran out") in kit-orange. */
export function ClearancePill({ state, words }: Pick<StaffClearance, "state" | "words">) {
  return <Pill tone={state === "ok" ? "done" : "action"}>{words}</Pill>;
}
