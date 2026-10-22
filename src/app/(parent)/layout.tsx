import type { ReactNode } from "react";
import { InstallGate } from "@/components/InstallGate";
import { TopShortcuts } from "@/components/TopShortcuts";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import { TabBar } from "@/components/TabBar";
import { getShell } from "@/lib/parent/load";

export default async function ParentLayout({ children }: { children: ReactNode }) {
  const shell = await getShell();
  return (
    <div className="relative mx-auto flex min-h-dvh max-w-[430px] flex-col bg-cream pb-[calc(var(--tab-bar-height,calc(80px+env(safe-area-inset-bottom)))+16px)]">
      <TopShortcuts unread={shell.messages} sessionToday={shell.sessionToday} hasChildren={shell.hasChildren} />
      {children}
      <InstallGate isStaff={shell.isStaff} />
      <RegisterServiceWorker />
      <TabBar unread={shell.unread} />
    </div>
  );
}
