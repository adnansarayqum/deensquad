import type { Metadata } from "next";
import type { ReactNode } from "react";
import { StaffShell } from "@/components/admin/StaffShell";
import { requireStaff } from "@/lib/auth/session";

export const metadata: Metadata = { title: { template: "%s · Club admin · Deen Squad", default: "Club admin · Deen Squad" } };

// The coach tools (register, plans, practice sheets, points and stars) share the club admin's shell, so every
// page is one tap away from every other. Pages keep their own requireStaff/requireAdmin checks.
export default async function CoachLayout({ children }: { children: ReactNode }) {
  const user = await requireStaff();
  return <StaffShell user={user}>{children}</StaffShell>;
}
