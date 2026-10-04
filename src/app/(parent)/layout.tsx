import type { ReactNode } from "react";
import { TabBar } from "@/components/TabBar";
import { getShell } from "@/lib/parent/load";

export default async function ParentLayout({ children }: { children: ReactNode }) {
  const shell = await getShell();
  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-cream pb-[calc(96px+env(safe-area-inset-bottom))]">
      {children}
      <TabBar unread={shell.unread} playerLabel={shell.childNames.length === 1 ? shell.childNames[0] : "Players"} />
    </div>
  );
}
