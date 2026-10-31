import { QUICK_DEFAULTS, QUICK_LENGTH } from "@/lib/messages/quick-answers";

/** A session staff can ask about: "Fri 6 Nov · Training · 6:30pm · U7, U10". */
export type ComingToOption = { id: string; label: string };

/**
 * Under "Who is it for?" on the post form: let parents reply to you, and ask for a quick answer (2 to 4 options,
 * starting Yes / No). The option boxes show only while "Ask for a quick answer" is ticked, by CSS, so the form works
 * without JavaScript.
 */
export function NewsReplyOptions({
  sessions = [],
  comingTo = "",
  replies = false,
}: {
  sessions?: ComingToOption[];
  /** Preselected from a session's "Ask who's coming". */
  comingTo?: string;
  /** "Let parents reply to you" ticked to start with (a message to chosen families). */
  replies?: boolean;
}) {
  return (
    <fieldset className="group/qa flex flex-col gap-2">
      <legend className="field-label">Answers from parents</legend>
      <label className="flex min-h-12 items-center gap-3 text-[15px]">
        <input type="checkbox" name="allowReplies" defaultChecked={replies} className="h-5 w-5 shrink-0 accent-[var(--grass)]" />
        <span>
          <b>Let parents reply to you</b>: each family&apos;s reply is a private conversation with you
        </span>
      </label>
      <label className="flex min-h-12 items-center gap-3 text-[15px]">
        <input type="checkbox" name="quickAnswer" className="h-5 w-5 shrink-0 accent-[var(--grass)]" />
        <span>
          <b>Ask for a quick answer</b>: one tap per child, which also counts as read
        </span>
      </label>
      <div className="hidden flex-col gap-2 pl-8 group-has-[[name=quickAnswer]:checked]/qa:flex">
        <p className="text-sm text-ink-muted">2 to 4 answers, up to {QUICK_LENGTH} characters each. Leave a box empty to use fewer.</p>
        <div className="grid grid-cols-2 gap-2">
          {QUICK_DEFAULTS.map((value, i) => (
            <div key={i}>
              <label htmlFor={`option-${i + 1}`} className="field-label">
                Answer {i + 1}
              </label>
              <input id={`option-${i + 1}`} name="option" defaultValue={value} maxLength={QUICK_LENGTH} className="field" />
            </div>
          ))}
        </div>
      </div>
      {sessions.length ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="comingTo" className="text-[15px]">
            <b>Ask who&apos;s coming</b>: parents tap Coming or Not coming for each child on the post, and the answer goes
            on the register
          </label>
          <select id="comingTo" name="comingTo" className="field" defaultValue={sessions.some((s) => s.id === comingTo) ? comingTo : ""}>
            <option value="">No, not about a session</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </fieldset>
  );
}
