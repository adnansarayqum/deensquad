import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getFamily } from "@/lib/parent/load";

/**
 * For staff who are also parents: a pill at the top of a parent screen back to their club tools (the club admin
 * for admins, the register for coaches). Nothing for anyone else. `on` is the header it sits on.
 */
export async function StaffSwitch({ on = "pitch", className = "" }: { on?: "pitch" | "pitch-deep"; className?: string }) {
  const { user } = await getFamily();
  if (!user.staff) return null;
  const admin = user.staff.role === "admin";
  return (
    <div className={`relative flex justify-end ${className}`}>
      <Link
        href={admin ? "/admin" : "/coach"}
        className={`inline-flex min-h-12 items-center gap-1 rounded-pill px-4 text-sm font-extrabold ${on === "pitch" ? "bg-pitch-deep text-floodlight" : "bg-pitch text-on-pitch"}`}
      >
        {admin ? "Club admin" : "Coach tools"}
        <ChevronRight aria-hidden size={18} />
      </Link>
    </div>
  );
}
