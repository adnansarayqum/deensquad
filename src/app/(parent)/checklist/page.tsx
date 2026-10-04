import type { Metadata } from "next";
import Link from "next/link";
import { Camera, Check, CreditCard, IdCard, MessageCircle, Phone, Shirt } from "lucide-react";
import { AppHeader, Eyebrow, Progress } from "@/components/ui";
import { getParentView } from "@/lib/data";
import type { ChecklistItem } from "@/lib/domain";

export const metadata: Metadata = { title: "Checklist" };

const icons: Record<ChecklistItem["icon"], typeof Camera> = { card: CreditCard, camera: Camera, shirt: Shirt, phone: Phone, id: IdCard };
const actionHref: Partial<Record<ChecklistItem["id"], string>> = {
  "payment-plan": "/checklist/payment",
  "photo-consent": "/checklist/consent",
};

export default async function ChecklistPage() {
  const view = await getParentView();
  const { items, doneCount, total } = view.checklist;
  const child = view.player.firstName;
  const todo = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const remaining = total - doneCount;

  return (
    <>
      <AppHeader>
        <h1 className="font-display text-[40px] leading-[0.95] tracking-[0.02em]">{child}&apos;s checklist</h1>
        <div className="flex items-center gap-3">
          <Progress value={doneCount} max={total} label={`${doneCount} of ${total} steps done`} onDark />
          <span className="font-display text-[26px] leading-none text-floodlight tabular-nums">
            {doneCount} / {total}
          </span>
        </div>
        <p className="text-sm text-on-pitch-muted">
          {remaining === 0
            ? `All done. ${child} is fully set up.`
            : `${remaining === 1 ? "One more step" : `${remaining} more steps`} and ${child} is fully set up.`}
        </p>
      </AppHeader>

      <main className="flex flex-col gap-2.5 px-4 pt-4 pb-4">
        {todo.length > 0 ? (
          <>
            <Eyebrow>Still to do</Eyebrow>
            {todo.map((item) => {
              const Icon = icons[item.icon];
              const href = actionHref[item.id] ?? "/checklist";
              return (
                <Link
                  key={item.id}
                  href={href}
                  className="flex items-center gap-3.5 rounded-app border-2 border-line bg-paper p-3.5 shadow-lip-neutral transition-transform active:translate-y-1 active:shadow-none"
                >
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-orange-tint text-kit-orange">
                    <Icon aria-hidden size={24} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-base font-bold">{item.title}</span>
                    <span className="text-sm text-ink-muted">{item.detail}</span>
                  </span>
                  <span className="rounded-xl bg-grass px-3 py-2 text-sm font-extrabold text-on-grass shadow-[0_3px_0_var(--grass-lip)]">
                    {item.actionLabel}
                  </span>
                </Link>
              );
            })}
          </>
        ) : null}

        <Eyebrow className="mt-2">Done</Eyebrow>
        {done.map((item) => (
          <div key={item.id} className="flex items-center gap-3.5 rounded-app bg-grass-tint px-3.5 py-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-pill bg-grass text-on-grass">
              <Check aria-hidden size={18} strokeWidth={3} />
            </span>
            <span className="flex flex-col">
              <span className="text-[15px] font-bold">{item.title}</span>
              <span className="text-[13px] text-ink-muted">
                {item.id === "photo-consent" && view.photoConsent
                  ? view.photoConsent === "yes"
                    ? "Photos are fine"
                    : "No photos, faces blurred"
                  : item.doneDetail}
              </span>
            </span>
          </div>
        ))}

        <div className="mt-3 flex items-center gap-3 rounded-app bg-pitch-deep px-3.5 py-3 text-on-pitch">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-floodlight text-on-gold">
            <MessageCircle aria-hidden size={22} />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[15px] font-bold">Ask Deen Squad · coming soon</span>
            <span className="text-[13px] text-on-pitch-muted">&ldquo;What kit for Friday?&rdquo; · &ldquo;Have I paid?&rdquo;</span>
          </span>
        </div>
      </main>
    </>
  );
}
