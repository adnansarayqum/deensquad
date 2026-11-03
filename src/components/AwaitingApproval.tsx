import Link from "next/link";
import { Hourglass } from "lucide-react";
import type { Child } from "@/lib/domain";
import { groupPlural } from "@/lib/domain";

const list = (names: string[]) => (names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

/**
 * Children a parent added who the club hasn't approved yet (migration 0047): says why their group's news and
 * sessions aren't showing, and what the parent can do meanwhile. Nothing when every child is approved.
 */
export function AwaitingApproval({ children }: { children: Child[] }) {
  const waiting = children.filter((c) => c.awaitingApproval);
  if (waiting.length === 0) return null;
  const names = list(waiting.map((c) => c.firstName));
  const groups = list([...new Set(waiting.map((c) => groupPlural(c.ageGroup)))]);
  return (
    <section aria-labelledby="awaiting-approval" className="flex gap-3 rounded-app bg-paper p-4 shadow-card">
      <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-fill text-ink">
        <Hourglass size={22} />
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <h2 id="awaiting-approval" className="text-[18px] font-bold">
          The club is checking {names}&apos;s details
        </h2>
        <p className="text-[15px] leading-[22px] text-ink-muted">
          You&apos;ll see the {groups} news and sessions once they&apos;ve approved {waiting.length === 1 ? names : "them"}. We&apos;ll email you. Meanwhile you can fill in
          your To-do.
        </p>
        <Link href="/checklist" className="self-start text-[15px] font-bold text-grass-text underline">
          Open To-do
        </Link>
      </div>
    </section>
  );
}
