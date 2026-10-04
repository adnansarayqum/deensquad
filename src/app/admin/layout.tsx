import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { signOut } from "@/lib/auth/actions";
import { requireStaff } from "@/lib/auth/session";

export const metadata: Metadata = { title: { template: "%s · Club admin · Deen Squad", default: "Club admin · Deen Squad" } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireStaff();
  return (
    <div className="min-h-dvh bg-cream">
      <header className="rounded-b-[24px] bg-pitch px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 text-on-pitch">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <Link href="/admin" className="flex items-center gap-2.5">
              <Image src="/crest.png" alt="" width={36} height={36} className="rounded-[8px]" />
              <span className="font-display text-[30px] leading-none tracking-[0.02em]">Club admin</span>
            </Link>
            <div className="flex items-center gap-4 text-sm font-bold text-on-pitch-muted">
              {user.guardian ? (
                <Link href="/news" className="inline-flex min-h-11 items-center">
                  Parent app
                </Link>
              ) : null}
              <Link href="/coach" className="inline-flex min-h-11 items-center">
                Register
              </Link>
              <form action={signOut}>
                <button type="submit" className="inline-flex min-h-11 items-center">
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <AdminNav isAdmin={user.staff.role === "admin"} />
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-5 pb-[max(env(safe-area-inset-bottom),32px)]">{children}</main>
    </div>
  );
}
