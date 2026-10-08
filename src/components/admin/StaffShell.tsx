import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { SignOutForm } from "@/components/SignOutForm";
import type { CurrentUser } from "@/lib/auth/session";

/**
 * The one frame for every staff page (/admin and /coach): phones get the pitch header with wrapping pill
 * navigation; computers (lg and up) a pitch sidebar and a wide main column. Only one of the two is shown, so the
 * page has one "Club admin" nav. Pages put a PageHeader first and cards (Section) after it.
 */
export function StaffShell({ user, children }: { user: CurrentUser & { staff: NonNullable<CurrentUser["staff"]> }; children: ReactNode }) {
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
        <header className="rounded-b-[24px] bg-pitch px-4 pt-[max(env(safe-area-inset-top),12px)] pb-2 text-on-pitch lg:hidden">
          <div className="mx-auto flex max-w-3xl flex-col gap-2.5 pt-1">
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
