import { MEDICAL_FIELDS, MEDICAL_LABELS, type Medical } from "@/lib/medical/data";

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });

/** A child's medical and additional needs as the parents wrote them, for staff allowed to read them. */
export function MedicalDetails({ medical, firstName }: { medical: Medical | null; firstName: string }) {
  if (!medical) return <p className="text-[15px] text-ink-muted">{firstName}&apos;s parents haven&apos;t added any.</p>;
  return (
    <div className="flex flex-col gap-3">
      <dl className="flex flex-col gap-3 text-[15px] leading-[22px]">
        {MEDICAL_FIELDS.filter((f) => medical[f]).map((f) => (
          <div key={f}>
            <dt className="text-sm font-bold text-ink-muted">{MEDICAL_LABELS[f]}</dt>
            <dd className="break-words whitespace-pre-line">{medical[f]}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-ink-muted">Last updated by the parent on {day.format(new Date(medical.updatedAt))}.</p>
    </div>
  );
}
