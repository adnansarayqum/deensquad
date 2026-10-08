import type { Metadata } from "next";
import { BulkCancelPage } from "@/components/admin/BulkCancelPage";

export const metadata: Metadata = { title: "Put sessions back on" };

export default async function BulkRestore({ searchParams }: PageProps<"/admin/sessions/bulk/restore">) {
  const { ids } = await searchParams;
  return <BulkCancelPage restore ids={ids} />;
}
