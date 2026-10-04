import type { Metadata } from "next";
import Link from "next/link";
import { Camera, Check, CreditCard, ExternalLink, IdCard, Phone, Shirt } from "lucide-react";
import { shopUrl } from "@/lib/config";
import { AppHeader, Card, Eyebrow, Progress } from "@/components/ui";
import { getChecklistPage } from "@/lib/parent/load";
import type { ChecklistItemView } from "@/lib/parent/views";

export const metadata: Metadata = { title: "To-do" };

const icons: Record<ChecklistItemView["icon"], typeof Camera> = { card: CreditCard, camera: Camera, phone: Phone, id: IdCard };

export default async function ChecklistPage() {
  const { family, groups, done, total } = await getChecklistPage();
  const single = groups.length === 1 ? groups[0] : null;
  const remaining = total - done;
  const who = single ? single.child.firstName : "everyone";
  const shop = shopUrl();

  return (
    <>
      <AppHeader>
        <h1 className="font-display text-[40px] leading-[0.95] tracking-[0.02em]">
          {single ? `${single.child.firstName}'s checklist` : "Your checklist"}
        </h1>
        {total > 0 ? (
          <>
            <div className="flex items-center gap-3">
              <Progress value={done} max={total} label={`${done} of ${total} steps done`} onDark />
              <span className="font-display text-[26px] leading-none text-floodlight tabular-nums">
                {done} / {total}
              </span>
            </div>
            <p className="text-sm text-on-pitch-muted">
              {remaining === 0
                ? `All done. ${single ? `${who} is` : "Everyone is"} fully set up.`
                : `${remaining === 1 ? "One more step" : `${remaining} more steps`} and ${single ? `${who} is` : "everyone is"} fully set up.`}
            </p>
          </>
        ) : null}
      </AppHeader>

      <main className="flex flex-col gap-2.5 px-4 pt-4 pb-4">
        {family.children.length === 0 ? (
          <Card className="p-4 text-[15px] leading-[22px]">No players are linked to your email yet. Ask the club to add your child.</Card>
        ) : null}

        {groups.map(({ child, items }) => {
          const todo = items.filter((i) => !i.done);
          const finished = items.filter((i) => i.done);
          return (
            <section key={child.id} aria-label={`${child.firstName}'s checklist`} className="flex flex-col gap-2.5">
              {!single ? (
                <h2 className="mt-2 flex items-baseline justify-between text-[19px] font-extrabold">
                  {child.firstName}
                  <span className="text-sm font-bold text-ink-muted tabular-nums">
                    {finished.length} of {items.length} done
                  </span>
                </h2>
              ) : null}
              {todo.length > 0 ? (
                <>
                  {single ? <Eyebrow>Still to do</Eyebrow> : null}
                  {todo.map((item) => {
                    const Icon = icons[item.icon];
                    return (
                      <Link
                        key={item.id}
                        href={item.href ?? "/checklist"}
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
              {single && finished.length > 0 ? <Eyebrow className="mt-2">Done</Eyebrow> : null}
              {finished.map((item) => {
                const row = (
                  <>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-pill bg-grass text-on-grass">
                      <Check aria-hidden size={18} strokeWidth={3} />
                    </span>
                    <span className="flex flex-col">
                      <span className="text-[15px] font-bold">{item.title}</span>
                      <span className="text-[13px] text-ink-muted">{item.detail}</span>
                    </span>
                  </>
                );
                const cls = "flex items-center gap-3.5 rounded-app bg-grass-tint px-3.5 py-2";
                // Finished steps a parent can still change (contacts, consent) stay tappable.
                return item.href && item.id !== "payment-plan" ? (
                  <Link key={item.id} href={item.href} className={cls}>
                    {row}
                  </Link>
                ) : (
                  <div key={item.id} className={cls}>
                    {row}
                  </div>
                );
              })}
            </section>
          );
        })}

        {shop && family.children.length > 0 ? (
          <a
            href={shop}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center gap-3 rounded-app bg-pitch-deep px-3.5 py-3 text-on-pitch"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-floodlight text-on-gold">
              <Shirt aria-hidden size={24} />
            </span>
            <span className="flex flex-1 flex-col">
              <span className="text-[15px] font-bold">Club shop</span>
              <span className="text-[13px] text-on-pitch-muted">Training tops, kit and more</span>
            </span>
            <ExternalLink aria-hidden size={18} className="shrink-0 text-on-pitch-muted" />
          </a>
        ) : null}
      </main>
    </>
  );
}
