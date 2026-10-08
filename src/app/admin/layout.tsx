import type { Metadata } from "next";
import type { ReactNode } from "react";
import { StaffShell } from "@/components/admin/StaffShell";
import { requireStaff } from "@/lib/auth/session";

export const metadata: Metadata = { title: { template: "%s · Club admin · Deen Squad", default: "Club admin · Deen Squad" } };

// The same shell as /coach (src/app/coach/layout.tsx), so every staff page has the one navigation.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireStaff();
  return <StaffShell user={user}>{children}</StaffShell>;
}
