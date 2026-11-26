import { notFound, redirect } from "next/navigation";
import { UUID } from "@/lib/auth/tokens";
import { asUser } from "@/lib/db";
import { conversationChild } from "@/lib/messages/data";
import { getFamily } from "@/lib/parent/load";

/**
 * A conversation's old address (notifications, "See in Messages", links sent before 26 Nov 2026): the family has
 * one chat now, so this opens it at that conversation. Someone else's, or one that isn't there, is a 404 as before.
 */
export default async function ConversationPage({ params }: PageProps<"/messages/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { user, family } = await getFamily();
  const child = await asUser(user.id, (tx) => conversationChild(tx, id, { parent: family.children.map((c) => c.id) }));
  if (!child) notFound();
  redirect(`/messages#t-${id}`);
}
