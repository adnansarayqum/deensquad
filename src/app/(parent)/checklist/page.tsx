import type { Metadata } from "next";
import Link from "next/link";
import { Camera, Check, ChevronRight, CreditCard, FileSignature, HeartPulse, IdCard, Phone, QrCode } from "lucide-react";
import { AppHeader, Card, Eyebrow, Progress } from "@/components/ui";
import { getChecklistPage } from "@/lib/parent/load";
import { countSteps, type ChecklistItemView } from "@/lib/parent/views";

export const metadata: Metadata = { title: "To-do" };

/** The order a new parent meets the steps: the contract, someone to call, photos, then payments. */
const STEP_ORDER: Record<ChecklistItemView["id"], number> = {
  agreement: 0,
  "emergency-contacts": 1,
  "photo-consent": 2,
  "payment-plan": 3,
  registered: 4,
  medical: 5,
  "hub-code": 6,
};

const icons: Record<ChecklistItemView["icon"], typeof Camera> = {
  card: CreditCard,
  camera: Camera,
  phone: Phone,
  id: IdCard,
  contract: FileSignature,
  medical: HeartPulse,
  qr: QrCode,
};

export default async function ChecklistPage() {
  const { family, groups, familyItems, done, total } = await getChecklistPage();
  const single = groups.length === 1 ? groups[0] : null;
  const remaining = total - done;
  const who = single ? single.child.firstName : "everyone";
  // One child: the family's steps (contract, payments) sit in that child's list. Several: they come first, once.
  // Optional lines (medical needs, the sports hub code) are gathered at the end under their own heading.
  const required = (items: ChecklistItemView[]) => items.filter((i) => !i.optional).sort((a, b) => STEP_ORDER[a.id] - STEP_ORDER[b.id]);
  const sections = single
    ? [{ key: single.child.id, label: `${single.child.firstName}'s checklist`, heading: null, items: required([...familyItems, ...single.items]) }]
    : [
        ...(familyItems.length ? [{ key: "family", label: "Whole family", heading: "Whole family", items: required(familyItems) }] : []),
        ...groups.map(({ child, items }) => ({ key: child.id, label: `${child.firstName}'s checklist`, heading: child.firstName, items: required(items) })),
      ];
  const optionalItems = [...familyItems, ...groups.flatMap((g) => g.items)].filter((i) => i.optional);

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

        {sections.map(({ key, label, heading, items }) => {
          const todo = items.filter((i) => !i.done);
          const finished = items.filter((i) => i.done);
          // Counted like the progress bar (the contract counts each child).
          const steps = countSteps(items);
          const doneRows = finished.map((item) => <DoneRow key={item.id} item={item} />);
          // A child with nothing left folds to one line, so the screen shows what still needs doing.
          if (heading && todo.length === 0) {
            return (
              <details key={key} aria-label={label} className="group mt-2 rounded-app border-2 border-line bg-paper">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2 [&::-webkit-details-marker]:hidden">
                  <span className="text-[17px] font-extrabold">{heading}</span>
                  <span className="flex items-center gap-1.5 text-sm font-bold text-grass-text tabular-nums">
                    <Check aria-hidden size={16} strokeWidth={3} />
                    {steps.done} of {steps.total} done
                    <ChevronRight aria-hidden size={18} className="text-ink-muted transition-transform group-open:rotate-90" />
                  </span>
                </summary>
                <div className="flex flex-col gap-2.5 px-2 pb-2">{doneRows}</div>
              </details>
            );
          }
          return (
            <section key={key} aria-label={label} className="flex flex-col gap-2.5">
              {heading ? (
                <h2 className="mt-2 flex items-baseline justify-between text-[19px] font-extrabold">
                  {heading}
                  <span className="text-sm font-bold text-ink-muted tabular-nums">
                    {steps.done} of {steps.total} done
                  </span>
                </h2>
              ) : null}
              {todo.length > 0 ? (
                <>
                  {single ? <Eyebrow>Still to do</Eyebrow> : null}
                  {todo.map((item) => (item.parts ? <PartsRow key={item.id} item={item} /> : <TodoRow key={item.id} item={item} />))}
                </>
              ) : null}
              {single && finished.length > 0 ? <Eyebrow className="mt-2">Done</Eyebrow> : null}
              {doneRows}
            </section>
          );
        })}

        {optionalItems.length > 0 ? (
          // Never "to do": neutral rows, apart from the steps, and not counted in the progress.
          <section aria-labelledby="optional" className="mt-3 flex flex-col gap-2.5">
            <Eyebrow>
              <span id="optional">Optional</span>
            </Eyebrow>
            {optionalItems.map((item) => (
              <OptionalRow key={`${item.id}:${item.href}`} item={item} />
            ))}
          </section>
        ) : null}
      </main>
    </>
  );
}

function DoneRow({ item }: { item: ChecklistItemView }) {
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
  // Finished steps a parent can still change (contacts, consent, one child's contract) stay tappable.
  return item.href && item.id !== "payment-plan" && !item.parts ? (
    <Link href={item.href} className={cls}>
      {row}
    </Link>
  ) : (
    <div className={cls}>{row}</div>
  );
}

function TodoRow({ item }: { item: ChecklistItemView }) {
  const Icon = icons[item.icon];
  return (
    <Link
      href={item.href ?? "/checklist"}
      className="flex items-center gap-3.5 rounded-app border-2 border-line bg-paper p-3.5 shadow-lip-neutral transition-transform active:translate-y-1 active:shadow-none"
    >
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-orange-tint text-kit-orange">
        <Icon aria-hidden size={24} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-base font-bold">{item.title}</span>
        <span className="text-sm text-ink-muted">{item.detail}</span>
        {item.note ? <span className="text-sm font-bold">{item.note}</span> : null}
      </span>
      <span className="rounded-xl bg-grass px-3 py-2 text-sm font-extrabold text-on-grass shadow-[0_3px_0_var(--grass-lip)]">{item.actionLabel}</span>
    </Link>
  );
}

/** A line the parent may fill in or leave: neutral, not kit-orange (it isn't an action the club is waiting for). */
function OptionalRow({ item }: { item: ChecklistItemView }) {
  const Icon = icons[item.icon];
  return (
    <Link href={item.href ?? "/checklist"} className="flex min-h-12 items-center gap-3.5 rounded-app border-2 border-line bg-paper px-3.5 py-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cream text-ink-muted">
        <Icon aria-hidden size={22} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-bold">{item.title}</span>
        <span className="text-[13px] text-ink-muted">{item.detail}</span>
      </span>
      <span className="text-sm font-bold text-grass-text">{item.actionLabel}</span>
      <ChevronRight aria-hidden size={18} className="shrink-0 text-ink-muted" />
    </Link>
  );
}

/** A family step done child by child (the club contract): one row, with each child's state and a link for those still to do. */
function PartsRow({ item }: { item: ChecklistItemView }) {
  const Icon = icons[item.icon];
  return (
    <div className="flex flex-col gap-3 rounded-app border-2 border-line bg-paper p-3.5 shadow-lip-neutral">
      <div className="flex items-center gap-3.5">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-orange-tint text-kit-orange">
          <Icon aria-hidden size={24} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-base font-bold">{item.title}</span>
          <span className="text-sm text-ink-muted">{item.detail}</span>
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {item.parts!.map((p) =>
          p.done ? (
            <li key={p.childId} className="flex min-h-12 items-center gap-3 rounded-xl bg-grass-tint px-3">
              <Check aria-hidden size={18} strokeWidth={3} className="text-grass-text" />
              <span className="flex-1 text-[15px] font-bold">{p.name}</span>
              <span className="text-sm font-bold text-grass-text">Signed</span>
            </li>
          ) : (
            <li key={p.childId}>
              <Link href={p.href} className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-line px-3">
                <span className="flex-1 text-[15px] font-bold">
                  {item.actionLabel} with {p.name}
                </span>
                <span className="text-sm font-bold text-kit-orange">To sign</span>
                <ChevronRight aria-hidden size={18} className="text-ink-muted" />
              </Link>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
