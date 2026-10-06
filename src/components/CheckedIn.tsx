import { Check } from "lucide-react";
import { clock } from "@/lib/dates";
import { Pill } from "./ui";

/** "Musa was checked in at 5:58pm", in grass with a word, once the coach has scanned or marked the child here today. */
export function CheckedIn({ name, at }: { name: string; at: string }) {
  return (
    <div role="status" className="flex items-center gap-3 rounded-app bg-grass-tint px-3.5 py-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-pill bg-grass text-on-grass">
        <Check aria-hidden size={22} strokeWidth={3} />
      </span>
      <p className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <Pill tone="done">Here</Pill>
        <span className="text-[15px] leading-[22px] font-bold text-grass-text">
          {name} was checked in at {clock(at)}
        </span>
      </p>
    </div>
  );
}
