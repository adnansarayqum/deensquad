import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Phone, Trash2 } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { ContactForm } from "@/components/ContactForm";
import { Card, Eyebrow } from "@/components/ui";
import { removeEmergencyContact } from "@/lib/parent/actions";
import { getContactsPage } from "@/lib/parent/load";

export const metadata: Metadata = { title: "Emergency contacts" };

export default async function ContactsPage({ searchParams }: PageProps<"/checklist/contacts">) {
  const { family, child, contacts } = await getContactsPage((await searchParams).child);
  if (!child) redirect("/checklist");
  const siblings = family.children.filter((c) => c.id !== child.id).map((c) => ({ id: c.id, firstName: c.firstName }));

  return (
    <>
      <BackHeader back="/checklist" backLabel="Checklist" title="Emergency contacts">
        People the club can call about {child.firstName} if they can&apos;t reach you.
      </BackHeader>

      <main className="flex flex-col gap-4 px-4 pt-4 pb-4">
        {contacts.length > 0 ? (
          <section aria-labelledby="saved" className="flex flex-col gap-2">
            <Eyebrow>
              <span id="saved">Saved for {child.firstName}</span>
            </Eyebrow>
            {contacts.map((c) => (
              <Card key={c.id} className="flex items-center gap-3 px-3.5 py-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-grass-tint text-grass-text">
                  <Phone aria-hidden size={20} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[15px] font-bold">{c.name}</span>
                  <span className="text-[13px] text-ink-muted">
                    {c.phone}
                    {c.relationship ? ` · ${c.relationship}` : ""}
                  </span>
                </span>
                <form action={removeEmergencyContact}>
                  <input type="hidden" name="id" value={c.id} />
                  <button
                    type="submit"
                    aria-label={`Remove ${c.name}`}
                    className="grid h-11 w-11 place-items-center rounded-xl text-ink-muted hover:bg-orange-tint hover:text-kit-orange"
                  >
                    <Trash2 aria-hidden size={20} />
                  </button>
                </form>
              </Card>
            ))}
          </section>
        ) : null}

        <section aria-labelledby="add" className="flex flex-col gap-3">
          <h2 id="add" className="text-base font-extrabold">
            {contacts.length ? "Add another contact" : "Add a contact"}
          </h2>
          <ContactForm child={{ id: child.id, firstName: child.firstName }} siblings={siblings} />
        </section>
      </main>
    </>
  );
}
