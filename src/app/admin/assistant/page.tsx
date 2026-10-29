import type { Metadata } from "next";
import { PageHeader, Section } from "@/components/admin/bits";
import { AssistantChat } from "@/components/admin/AssistantChat";
import { aiConfigured } from "@/lib/ai/claude";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Assistant" };

/** The admins' assistant (src/lib/assistant): questions answered from the app's own data; changes only on Confirm. */
export default async function AssistantPage() {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <PageHeader back={{ href: "/admin", label: "Overview" }} title="Assistant" subtitle="Answers come from the app only. Nothing changes until you tap Confirm." />
      {aiConfigured() ? (
        <>
          <AssistantChat />
          <p className="text-[13px] text-ink-muted">
            Your questions and what it looks up (names, contact details, payments, sessions) go to Claude, by Anthropic, to answer. It never sees medical
            needs, wellbeing check-ins or sports hub codes.
          </p>
        </>
      ) : (
        <Section title="Not switched on yet">
          <p className="text-[15px]">The assistant needs the club&apos;s Claude key, the same one that powers Tidy up with AI.</p>
        </Section>
      )}
    </div>
  );
}
