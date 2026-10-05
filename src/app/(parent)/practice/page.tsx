import type { Metadata } from "next";
import { BackHeader } from "@/components/BackHeader";
import { Attachment } from "@/components/plans/Attachment";
import { Card, Pill } from "@/components/ui";
import { getPracticePage } from "@/lib/parent/load";

export const metadata: Metadata = { title: "Practise at home" };

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });

export default async function PracticePage() {
  const { family, sheets } = await getPracticePage();
  const names = family.children.map((c) => c.firstName);
  const who = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "your child");
  return (
    <>
      <BackHeader back="/friday" backLabel="Friday" title="Practise at home">
        Drills from the coaches for {who} to try between sessions.
      </BackHeader>
      <main className="flex flex-col gap-3 px-4 pt-4 pb-4">
        {sheets.length === 0 ? <Card className="p-4 text-[15px]">Nothing from the coaches yet. Check back after Friday.</Card> : null}
        {sheets.map((s) => (
          <Card key={s.id} className="flex flex-col gap-2.5 p-4">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-[17px] font-extrabold">{s.title}</h2>
              {s.ageGroups.length ? <Pill tone="neutral">{s.ageGroups.join(", ")}</Pill> : null}
            </div>
            {s.body ? <p className="text-[15px] leading-[22px] whitespace-pre-line">{s.body}</p> : null}
            {s.file ? <Attachment file={s.file} from="/practice" /> : null}
            <p className="text-[13px] text-ink-muted">{[s.from, day.format(new Date(s.createdAt))].filter(Boolean).join(" · ")}</p>
          </Card>
        ))}
      </main>
    </>
  );
}
