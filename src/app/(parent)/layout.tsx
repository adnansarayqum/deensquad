import type { ReactNode } from "react";
import type { Viewport } from "next";
import { InstallGate } from "@/components/InstallGate";
import { TopShortcuts } from "@/components/TopShortcuts";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import { TabBar } from "@/components/TabBar";
import { Toaster } from "@/components/Toaster";
import { getShell } from "@/lib/parent/load";

/** Parent screens open on the light page ground, so the phone's status bar matches it (staff keep the green). */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f4ee" },
    { media: "(prefers-color-scheme: dark)", color: "#101912" },
  ],
};

export default async function ParentLayout({ children }: { children: ReactNode }) {
  const shell = await getShell();
  return (
    <div className="relative mx-auto flex min-h-dvh max-w-[430px] flex-col bg-cream pb-[calc(var(--tab-bar-height,calc(80px+env(safe-area-inset-bottom)))+16px)]">
      <TopShortcuts unread={shell.messages} sessionToday={shell.sessionToday} hasChildren={shell.hasChildren} />
      {children}
      <InstallGate isStaff={shell.isStaff} />
      <RegisterServiceWorker />
      <Toaster />
      <TabBar unread={shell.unread} />
    </div>
  );
}
