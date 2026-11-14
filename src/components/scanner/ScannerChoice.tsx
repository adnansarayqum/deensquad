"use client";

import { useSyncExternalStore } from "react";
import { PassScanner } from "@/components/PassScanner";
import { GateScanner } from "./GateScanner";

// Which gate scanner this phone uses. The first scanner is the default for everyone; "Try the new scanner" (admins,
// under the register's lists) switches this phone to the rebuilt one and back. Kept on the phone, not on the account,
// so a trial on one phone never changes what another coach has in their hand at the gate.

const KEY = "ds-new-scanner";
const CHANGED = "ds-new-scanner-changed";

function wantsNew(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** True when this phone is trying the new scanner. False on the server and until the page is live. */
function useNewScanner(): boolean {
  return useSyncExternalStore(subscribe, wantsNew, () => false);
}

type Props = { disabled?: boolean; disabledReason?: string; className?: string };

/** "Scan QR codes": the first scanner, or the rebuilt one on a phone that has chosen to try it. */
export function ScannerChoice(props: Props) {
  return useNewScanner() ? <GateScanner {...props} /> : <PassScanner {...props} />;
}

/** The switch, for admins: a quiet line under the register. */
export function TryNewScanner() {
  const on = useNewScanner();
  const set = (next: boolean) => {
    try {
      if (next) localStorage.setItem(KEY, "1");
      else localStorage.removeItem(KEY);
    } catch {
      return;
    }
    window.dispatchEvent(new Event(CHANGED));
  };
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-ink-muted">
      <span>{on ? "This phone is using the new scanner." : "A rebuilt scanner is ready to try on this phone."}</span>
      <button type="button" onClick={() => set(!on)} aria-pressed={on} className="inline-flex min-h-12 items-center font-bold text-ink underline">
        {on ? "Go back to the usual scanner" : "Try the new scanner"}
      </button>
    </p>
  );
}
