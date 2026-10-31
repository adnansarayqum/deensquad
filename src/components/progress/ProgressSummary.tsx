import { Pentagon, PentagonKey } from "@/components/charts/Pentagon";
import { CATEGORIES, categoryLine, ratedLine, summaryLabel, type ProgressSummary } from "@/lib/progress/ratings";

/**
 * A child's ratings: the pentagon (last 3 months, the 3 before dashed), its key, every category's score in words, and
 * how often they were rated. Shared by the coach's child page and the parent's Progress card; nothing about any other
 * child. Renders nothing without ratings in the last 3 months.
 */
export function ProgressSummaryView({ firstName, progress, by = false }: { firstName: string; progress: ProgressSummary; /** Staff: who rated last. */ by?: boolean }) {
  const { current, previous } = progress;
  if (!current) return null;
  const last = progress.last
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${progress.last.ratedOn}T12:00:00Z`))
    : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-center gap-1">
        <Pentagon current={current} previous={previous} label={summaryLabel(firstName, current, previous)} />
        <PentagonKey hasPrevious={previous !== null} />
      </div>
      <ul className="flex flex-col divide-y divide-line text-[15px] leading-[22px]">
        {CATEGORIES.map((c) => (
          <li key={c.key} className="py-1.5">
            {categoryLine(c.label, current[c.key], previous ? previous[c.key] : null)}
          </li>
        ))}
      </ul>
      <p className="text-[15px] text-ink-muted">
        {ratedLine(progress.count, progress.since)}
        {by && last ? ` · last ${last}${progress.last?.by ? ` by ${progress.last.by}` : ""}` : ""}
      </p>
    </div>
  );
}
