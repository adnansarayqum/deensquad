import { notFound, redirect } from "next/navigation";
import { UUID } from "@/lib/auth/tokens";
import { requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { conversationChild } from "@/lib/messages/data";

/**
 * A conversation's old address (notifications, the Not coming and Replies lists, incident records): each family has
 * one chat now, so this opens it at that conversation. A 404 when this member of staff can't read it.
 */
export default async function AdminConversationPage({ params }: PageProps<"/admin/messages/[id]">) {
  const user = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const child = await asUser(user.id, (tx) => conversationChild(tx, id, "staff"));
  if (!child) notFound();
  redirect(`/admin/messages/family/${child}#t-${id}`);
}
