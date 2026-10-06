import type { ReactNode } from "react";
import { ForgetPassCache } from "@/components/PassCacheWriter";

// Every sign-out lands here: forget the attendance QR codes saved on this phone, so the next person to sign in
// on it can't see the last family's (src/lib/pass/cache.ts).
export default function SignInLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ForgetPassCache />
    </>
  );
}
