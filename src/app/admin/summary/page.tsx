import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Section } from "@/components/admin/bits";
import { loadMonthlySummary, monthName, monthOf, parseMonth, previousMonth, summarySections } from "@/lib/admin/summary";
import { requireAdmin } from "@/lib/auth/session";
import { asUser } from "@/lib/db";

export const metadata: Metadata = { title: "Monthly summary" };

/**
 * A preview of the owner's monthly summary email (admins only; linked from nowhere): ?month=YYYY-MM, last month by
 * default. Same lines as the email; "Right now" figures are as they stand today.
 */
export default async function SummaryPreview({ searchParams }: PageProps<"/admin/summary">) {
  const user = await requireAdmin();
  const now = new Date();
  const month = parseMonth((await searchParams).month) ?? previousMonth(monthOf(now));
  const summary = await asUser(user.id, (tx) => loadMonthlySummary(tx, month, now));

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <PageHeader title={`${monthName(month)} summary`} subtitle="What the monthly email to admins says. Figures under Right now are as they stand today." />
      {summarySections(summary).map((s) => (
        <Section key={s.title} title={s.title}>
          <ul className="flex flex-col gap-1">
            {s.lines.map((l) => (
              <li key={l.text}>
                <Link href={l.path} className="inline-flex min-h-12 items-center text-[15px] text-grass-text underline">
                  {l.text}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ))}
    </div>
  );
}
