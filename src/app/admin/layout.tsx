import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { requireStaff } from "@/lib/auth/session";
import { SignOutForm } from "@/components/SignOutForm";

export const metadata: Metadata = { title: { template: "%s · Club admin · Deen Squad", default: "Club admin · Deen Squad" } };

// Phones (below lg): the pitch header with pill navigation. Computers (lg and up): a pitch sidebar
// and a wide main column. Only one of the two is shown, so the page has one "Club admin" nav.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireStaff();
  const isAdmin = user.staff.role === "admin";
  return (
    <div className="min-h-dvh bg-cream lg:flex">
      <aside aria-label="Club admin menu" className="hidden w-60 shrink-0 bg-pitch text-on-pitch lg:block">
        <div className="sticky top-0 flex h-dvh flex-col gap-6 overflow-y-auto px-3 py-6">
          <Link href="/admin" className="flex items-center gap-2.5 px-3">
            <Image src="/crest.png" alt="" width={40} height={40} className="rounded-[8px]" />
            <span className="font-display text-[30px] leading-none tracking-[0.02em]">Club admin</span>
          </Link>
          <AdminNav isAdmin={isAdmin} layout="sidebar" />
          <div className="mt-auto flex flex-col gap-1 border-t border-pitch-stripe pt-4 text-[15px] font-bold text-on-pitch-muted">
            <Link href="/coach" className="flex min-h-12 items-center rounded-dash px-3 hover:bg-pitch-deep">
              Register
            </Link>
            {user.guardian ? (
              <Link href="/news" className="flex min-h-12 items-center rounded-dash px-3 hover:bg-pitch-deep">
                Parent view
              </Link>
            ) : null}
            <SignOutForm>
              <button type="submit" className="flex min-h-12 w-full items-center rounded-dash px-3 hover:bg-pitch-deep">
                Sign out
              </button>
            </SignOutForm>
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="rounded-b-[24px] bg-pitch px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 text-on-pitch lg:hidden">
          <div className="mx-auto flex max-w-3xl flex-col gap-3 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <Link href="/admin" className="flex items-center gap-2.5">
                <Image src="/crest.png" alt="" width={36} height={36} className="rounded-[8px]" />
                <span className="font-display text-[30px] leading-none tracking-[0.02em]">Club admin</span>
              </Link>
              <div className="flex items-center gap-4 text-sm font-bold text-on-pitch-muted">
                {user.guardian ? (
                  <Link href="/news" className="inline-flex min-h-11 items-center">
                    Parent view
                  </Link>
                ) : null}
                <Link href="/coach" className="inline-flex min-h-11 items-center">
                  Register
                </Link>
                <SignOutForm>
                  <button type="submit" className="inline-flex min-h-11 items-center">
                    Sign out
                  </button>
                </SignOutForm>
              </div>
            </div>
            <AdminNav isAdmin={isAdmin} />
          </div>
        </header>
        <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-5 pb-[max(env(safe-area-inset-bottom),32px)] lg:max-w-6xl lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
