import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getFamily } from "@/lib/parent/load";

/**
 * For staff who are also parents: a pill at the top of a parent screen back to their club tools (the club admin
 * for admins, the register for coaches). Nothing for anyone else. `on` is the header it sits on. `compact` (Home):
 * a small pill under the greeting, still a 48px tap area, so the header is one row shorter.
 */
export async function StaffSwitch({ on = "pitch", className = "", compact = false }: { on?: "pitch" | "pitch-deep"; className?: string; compact?: boolean }) {
  const { user } = await getFamily();
  if (!user.staff) return null;
  const admin = user.staff.role === "admin";
  const label = admin ? "Club admin" : "Coach tools";
  if (compact) {
    return (
      <Link href={admin ? "/admin" : "/coach"} className={`-my-2 inline-flex min-h-12 items-center self-start ${className}`}>
        <span className="inline-flex h-8 items-center gap-0.5 rounded-pill bg-pitch pr-2 pl-3 text-meta font-bold text-on-pitch">
          {label}
          <ChevronRight aria-hidden size={16} />
        </span>
      </Link>
    );
  }
  return (
    <div className={`relative flex justify-start pr-32 ${className}`}>
      <Link
        href={admin ? "/admin" : "/coach"}
        className={`inline-flex min-h-12 items-center gap-1 rounded-pill px-4 text-small font-bold ${on === "pitch" ? "bg-pitch text-on-pitch" : "bg-pitch text-on-pitch"}`}
      >
        {admin ? "Club admin" : "Coach tools"}
        <ChevronRight aria-hidden size={20} />
      </Link>
    </div>
  );
}
