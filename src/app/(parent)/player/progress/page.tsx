import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackHeader } from "@/components/BackHeader";
import { Card } from "@/components/ui";
import { getProgressPage } from "@/lib/parent/load";
import { monthLabel } from "@/lib/progress/ratings";

export const metadata: Metadata = { title: "Progress reports" };

/** Player → Earlier reports: every published progress report for one of the parent's children. Not there while progress is off. */
export default async function ProgressReportsPage({ searchParams }: PageProps<"/player/progress">) {
  const page = await getProgressPage((await searchParams).child);
  if (!page) notFound();
  const { child, reports } = page;

  return (
    <>
      <BackHeader back={`/player?child=${child.id}`} backLabel="Family" title="Progress reports">
        {child.firstName}&apos;s reports from the coaches, newest first.
      </BackHeader>
      <main className="flex flex-col gap-3.5 px-4 pt-4 pb-4">
        {reports.length === 0 ? <Card className="p-4 text-[15px] leading-[22px]">No reports for {child.firstName} yet.</Card> : null}
        {reports.map((r) => (
          <Card key={r.id} className="flex flex-col gap-1.5 p-3.5">
            <h2 className="text-base font-bold">{monthLabel(r.month)}</h2>
            {r.by ? <p className="text-[13px] text-ink-muted">From {r.by}</p> : null}
            <p className="text-[15px] leading-[22px] whitespace-pre-line">{r.body}</p>
          </Card>
        ))}
      </main>
    </>
  );
}
