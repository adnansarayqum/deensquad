"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Check, Compass, Copy, Ellipsis, EllipsisVertical, SquarePlus } from "lucide-react";
import { AppHeader } from "@/components/ui";
import { track } from "@/lib/analytics";
import { installGateMode, readDismissCount, readSessionDismissed, recordDismiss, type InstallGateMode } from "@/lib/install-gate";

/** The browser's install prompt, stashed on window by the inline script in the root layout. */
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type GateWindow = Window & { __dsInstallPrompt?: InstallPrompt | null };

type View = { mode: InstallGateMode; offerNotNow: boolean };
const HIDDEN: View = { mode: "hidden", offerNotNow: false };

function standalone(): boolean {
  const display = ["standalone", "fullscreen", "minimal-ui"].some((m) => window.matchMedia(`(display-mode: ${m})`).matches);
  return display || (navigator as { standalone?: boolean }).standalone === true;
}

function decide(isStaff: boolean, path: string): View {
  return installGateMode({
    ua: navigator.userAgent,
    path,
    standalone: standalone(),
    coarse: window.matchMedia("(pointer: coarse)").matches,
    width: window.innerWidth,
    isStaff,
    dismissCount: readDismissCount(),
    sessionDismissed: readSessionDismissed(),
    hasPrompt: Boolean((window as GateWindow).__dsInstallPrompt),
  });
}

/**
 * Full-screen "add Deen Squad to your home screen" step for parents using a phone browser. Renders nothing
 * on the server and decides after mount, so an installed app never sees it flash.
 */
export function InstallGate({ isStaff }: { isStaff: boolean }) {
  const path = usePathname();
  const [view, setView] = useState<View>(HIDDEN);
  const [installed, setInstalled] = useState(false);
  const [prompting, setPrompting] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const open = view.mode !== "hidden";

  useEffect(() => {
    const update = () => setView(decide(isStaff, path));
    const done = () => setInstalled(true);
    const frame = requestAnimationFrame(update);
    window.addEventListener("ds-installprompt", update);
    window.addEventListener("appinstalled", done);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("ds-installprompt", update);
      window.removeEventListener("appinstalled", done);
    };
  }, [isStaff, path]);

  const dismiss = useCallback(() => {
    recordDismiss();
    setView(HIDDEN);
    track("install_gate_dismissed");
  }, []);

  // Counted once each time it opens (not again when, say, the browser's install prompt turns up meanwhile).
  const shownMode = open ? view.mode : null;
  const counted = useRef(false);
  useEffect(() => {
    if (!shownMode) {
      counted.current = false;
      return;
    }
    if (counted.current) return;
    counted.current = true;
    track("install_gate_shown", { mode: shownMode });
  }, [shownMode]);

  useEffect(() => {
    if (!open || !dialog.current) return;
    const gate = dialog.current;
    const parent = gate.parentElement;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    // The screen behind (page and tab bar, the gate's siblings in the parent layout) can't be reached by
    // Tab or a screen reader while the gate is up, including anything Next swaps in meanwhile.
    const shut = new Set<Element>();
    const shutSiblings = () => {
      for (const el of parent?.children ?? []) {
        if (el !== gate && !el.hasAttribute("inert")) {
          el.setAttribute("inert", "");
          shut.add(el);
        }
      }
    };
    shutSiblings();
    const watch = new MutationObserver(shutSiblings);
    if (parent) watch.observe(parent, { childList: true });
    heading.current?.focus();
    return () => {
      watch.disconnect();
      for (const el of shut) el.removeAttribute("inert");
      root.style.overflow = before;
      // Focus would otherwise be lost with the gate: put it at the top of the screen behind.
      const main = parent?.isConnected ? parent.querySelector<HTMLElement>("h1") : null;
      if (main && main.isConnected) {
        if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
        main.focus({ preventScroll: true });
      } else if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open || !view.offerNotNow) return;
    // While "Not now" is offered, Escape means "Not now". Once only "Continue in browser" is left, it does nothing.
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, view.offerNotNow, dismiss]);

  function trapFocus(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab" || !dialog.current) return;
    const items = [...dialog.current.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input")];
    if (!items.length) return e.preventDefault();
    const active = document.activeElement;
    if (e.shiftKey && (active === items[0] || active === heading.current)) {
      e.preventDefault();
      items[items.length - 1].focus();
    } else if (!e.shiftKey && active === items[items.length - 1]) {
      e.preventDefault();
      items[0].focus();
    }
  }

  async function install() {
    const event = (window as GateWindow).__dsInstallPrompt;
    if (!event) return setView(decide(isStaff, path));
    setPrompting(true);
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === "accepted") {
        setInstalled(true);
        track("install_prompt_accepted");
      }
    } catch {
      // The prompt can only be used once; fall through to the manual steps.
    }
    (window as GateWindow).__dsInstallPrompt = null;
    setPrompting(false);
    setView(decide(isStaff, path));
  }

  if (!open) return null;
  const ios = view.mode === "ios" || view.mode === "ios-inapp";
  const inApp = view.mode === "ios-inapp" || view.mode === "android-inapp";
  const first = inApp ? 2 : 1;

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-gate-title"
      onKeyDown={trapFocus}
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-cream text-ink"
    >
      <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col">
        <AppHeader>
          <div className="flex items-center gap-3">
            <Image src="/crest.png" alt="" width={52} height={52} className="rounded-[12px]" priority />
            <p className="text-label text-floodlight uppercase">The Deen Squad Football Academy</p>
          </div>
          <h2 id="install-gate-title" ref={heading} tabIndex={-1} className="font-display text-[44px] leading-[0.95] tracking-[0.02em] shadow-none outline-none">
            Add Deen Squad to your home screen
          </h2>
          <p className="text-[15px] leading-[22px] text-on-pitch-muted">Get club news notifications, and open it in one tap like an app.</p>
        </AppHeader>

        <div className="flex flex-1 flex-col gap-4 px-4 pt-5 pb-4">
          {installed ? (
            <p role="status" className="flex items-center gap-2.5 rounded-app bg-grass-tint px-4 py-3.5 text-[16px] font-bold text-grass-text">
              <Check aria-hidden size={22} className="shrink-0" />
              Done. Open Deen Squad from your home screen.
            </p>
          ) : view.mode === "android-prompt" ? (
            <p className="text-[16px] leading-6">Tap <b>Install the app</b> below, then <b>Install</b>.</p>
          ) : view.mode === "android-manual" || view.mode === "android-inapp" ? (
            <Steps>
              {view.mode === "android-inapp" ? (
                <Step n={1} icon={<InAppMenuIcons android />} extra={<CopyLink />}>
                  <b>Open this page in Chrome</b>: tap <b>⋮</b> or <b>•••</b>, then Open in Chrome (or Open in browser). You can&apos;t add
                  it from inside this app.
                </Step>
              ) : null}
              <Step n={first} icon={<EllipsisVertical aria-hidden size={24} />}>
                Tap the menu (<b>three dots</b>) at the top of your browser.
              </Step>
              <Step n={first + 1} icon={<SquarePlus aria-hidden size={24} />}>
                Choose <b>Add to Home screen</b> or <b>Install app</b>.
              </Step>
            </Steps>
          ) : (
            <Steps>
              {view.mode === "ios-inapp" ? (
                <Step n={1} icon={<InAppMenuIcons />} extra={<CopyLink />}>
                  <b>Open this page in Safari</b>: tap <b>•••</b> or the compass, then Open in Safari. You can&apos;t add it from inside
                  this app.
                </Step>
              ) : null}
              <Step n={first} icon={<ShareGlyph />}>
                Tap the <b>Share</b> icon. It&apos;s at the bottom of Safari on iPhone, at the top on iPad.
              </Step>
              <Step n={first + 1} icon={<SquarePlus aria-hidden size={24} />}>
                Choose <b>Add to Home Screen</b>.
              </Step>
              <Step n={first + 2} icon={<span className="text-[15px] font-bold">Add</span>}>
                Tap <b>Add</b>, then open Deen Squad from your home screen.
              </Step>
            </Steps>
          )}

          {ios ? (
            <p className="text-[14px] leading-5 text-ink-muted">You&apos;ll sign in once more in the app. We&apos;ll email you a 6-digit code, it takes 10 seconds.</p>
          ) : view.mode === "android-inapp" ? (
            <p className="text-[14px] leading-5 text-ink-muted">You&apos;ll sign in once more in Chrome. We&apos;ll email you a 6-digit code, it takes 10 seconds.</p>
          ) : null}
        </div>

        {/* Stays on screen however short the screen is (an iPhone SE with Safari's bars): the steps scroll above it. */}
        <div className="sticky bottom-0 flex flex-col items-center gap-2 border-t-2 border-line bg-cream px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)]">
          {view.mode === "android-prompt" && !installed ? (
            <button type="button" onClick={install} disabled={prompting} className="btn-chunky btn-grass w-full">
              Install the app
            </button>
          ) : null}
          {view.offerNotNow ? (
            <button type="button" onClick={dismiss} className="btn-chunky btn-paper w-full">
              Not now
            </button>
          ) : (
            <button type="button" onClick={dismiss} className="min-h-12 px-4 text-[14px] text-ink-muted underline underline-offset-2">
              Continue in browser
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="flex flex-col gap-3">{children}</ol>;
}

function Step({ n, icon, extra, children }: { n: number; icon: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-app border-2 border-line bg-paper p-4">
      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-pill bg-pitch text-[16px] font-bold text-on-pitch">
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3 pt-1.5">
        <p className="text-[16px] leading-6">{children}</p>
        {extra}
      </div>
      <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cream text-ink">
        {icon}
      </span>
    </li>
  );
}

/** Safari's Share glyph: a box with an arrow coming up out of it. */
function ShareGlyph() {
  return (
    <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="M7.5 7.5 12 3l4.5 4.5" />
      <path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" />
    </svg>
  );
}

function InAppMenuIcons({ android = false }: { android?: boolean }) {
  return (
    <span className="flex flex-col items-center">
      {android ? <EllipsisVertical aria-hidden size={20} /> : <Ellipsis aria-hidden size={20} />}
      {android ? <Ellipsis aria-hidden size={18} /> : <Compass aria-hidden size={18} />}
    </span>
  );
}

/** Copies this page's address so a parent in WhatsApp or Instagram can paste it into Safari or Chrome. */
function CopyLink() {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const field = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const href = typeof window === "undefined" ? "" : window.location.href;

  async function copy() {
    try {
      await navigator.clipboard.writeText(href);
      return setState("copied");
    } catch {
      // Older or locked-down in-app browsers: try the old way, else show the link to copy by hand.
    }
    const temp = document.createElement("textarea");
    temp.value = href;
    temp.setAttribute("readonly", "");
    temp.style.position = "fixed";
    temp.style.opacity = "0";
    document.body.appendChild(temp);
    temp.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    temp.remove();
    // Selecting the hidden copy took focus away; give it back to the button (or the link field, below).
    button.current?.focus();
    setState(ok ? "copied" : "manual");
  }

  useEffect(() => {
    if (state === "manual") field.current?.select();
  }, [state]);

  return (
    <div className="flex flex-col gap-2">
      <button ref={button} type="button" onClick={copy} className="btn-chunky btn-paper btn-small min-h-12 self-start">
        {state === "copied" ? <Check aria-hidden size={18} /> : <Copy aria-hidden size={18} />}
        {state === "copied" ? "Link copied" : "Copy link"}
      </button>
      {state === "manual" ? (
        <label className="flex flex-col gap-1 text-[14px] text-ink-muted">
          Press and hold the link to copy it
          <input ref={field} readOnly value={href} className="field text-[15px]" onFocus={(e) => e.currentTarget.select()} />
        </label>
      ) : null}
      <p role="status" className="sr-only">
        {state === "copied" ? "Link copied" : ""}
      </p>
    </div>
  );
}
