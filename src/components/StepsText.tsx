import { textBlocks } from "@/lib/text/steps";

/** A coach's text with numbered drills shown as a real numbered list (`textBlocks`); everything else as paragraphs. */
export function StepsText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 text-[16px] leading-6 ${className}`}>
      {textBlocks(text).map((b, i) =>
        b.kind === "para" ? (
          <p key={i} className="whitespace-pre-line">
            {b.text}
          </p>
        ) : (
          <ol key={i} className="flex list-decimal flex-col gap-1.5 pl-6 marker:font-bold">
            {b.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}
