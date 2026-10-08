import type { Metadata } from "next";
import { BulkCancelPage } from "@/components/admin/BulkCancelPage";

export const metadata: Metadata = { title: "Cancel sessions" };

export default async function BulkCancel({ searchParams }: PageProps<"/admin/sessions/bulk/cancel">) {
  const { ids } = await searchParams;
  return <BulkCancelPage restore={false} ids={ids} />;
}
