"use client";

import type { ReactNode } from "react";
import { signOut } from "@/lib/auth/actions";
import { clearPassCache, phoneStorage } from "@/lib/pass/cache";

/**
 * Sign out, forgetting the attendance QR codes saved on this phone first, so the next person to use it can't see
 * them. (The sign-in screen forgets them too, for a sign-out before this page had loaded.)
 */
export function SignOutForm({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <form action={signOut} onSubmit={() => clearPassCache(phoneStorage())} className={className}>
      {children}
    </form>
  );
}
