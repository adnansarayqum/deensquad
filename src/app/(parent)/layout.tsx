import type { ReactNode } from "react";
import { TabBar } from "@/components/TabBar";
import { getParentView } from "@/lib/data";

export default async function ParentLayout({ children }: { children: ReactNode }) {
  const view = await getParentView();
  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-cream pb-[calc(96px+env(safe-area-inset-bottom))]">
      {children}
      <TabBar unread={view.unreadCount} />
    </div>
  );
}
