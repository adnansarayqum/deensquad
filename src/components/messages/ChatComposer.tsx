"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, SendHorizontal } from "lucide-react";
import { MediaPicker } from "@/components/media/MediaPicker";
import { useKeptActionState } from "@/components/submitKeepingInput";
import type { MessageFormState } from "@/lib/messages/actions";
import { BODY_MAX } from "@/lib/messages/limits";

/**
 * The box at the foot of a chat: one line that grows as you type, Send beside it, always in reach above the tab bar
 * (`stick`: the bar's height). With several children, "About" chips choose whose conversation it joins (the latest
 * one's child to start with). Staff also get the paperclip (photos and videos) and quick replies.
 * A plain form posting a server action; what was typed stays if it doesn't send.
 */
export function ChatComposer({
  action,
  hidden = {},
  about = [],
  aboutNow = null,
  media = false,
  quickReplies,
  stick,
  placeholder = "Message",
}: {
  action: (prev: MessageFormState, formData: FormData) => Promise<MessageFormState>;
  hidden?: Record<string, string>;
  /** The family's children, when there's more than one to choose between. */
  about?: readonly { id: string; firstName: string }[];
  aboutNow?: string | null;
  media?: boolean;
  quickReplies?: readonly string[];
  /** Tailwind classes that pin it above the bar underneath (parents' tab bar or the staff one). */
  stick: string;
  placeholder?: string;
}) {
  const [state, run, pending, keep] = useKeptActionState<MessageFormState>(action, {});
  const form = useRef<HTMLFormElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const [sent, setSent] = useState(0);
  const [attach, setAttach] = useState(false);
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.saved) {
      setSent((n) => n + 1);
      setAttach(false);
    }
  }
  useEffect(() => {
    if (!state.saved) return;
    if (box.current) {
      box.current.value = "";
      box.current.style.height = "";
    }
  }, [state]);

  return (
    <form
      ref={form}
      action={run}
      onSubmit={keep}
      noValidate
      className={`sticky z-10 -mx-4 flex flex-col gap-2 border-t border-line bg-cream px-4 pt-2.5 pb-[max(env(safe-area-inset-bottom),10px)] ${stick}`}
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {state.error ? (
        <p role="alert" className="rounded-app bg-orange-tint px-3.5 py-2.5 text-small leading-[22px] text-ink">
          {state.error}
        </p>
      ) : null}
      {about.length > 1 ? (
        <fieldset className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <legend className="float-left mr-1 py-3 text-meta font-bold text-ink-muted">About</legend>
          {about.map((c) => (
            <label key={c.id} className="relative inline-flex min-h-12 shrink-0 cursor-pointer items-center">
              <input type="radio" name="about" value={c.id} defaultChecked={c.id === (aboutNow ?? about[0].id)} className="peer sr-only" />
              <span className="rounded-pill border border-line bg-paper px-3 py-1 text-small font-bold text-ink-muted peer-checked:border-grass peer-checked:bg-grass-tint peer-checked:text-grass-text peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-grass">
                {c.firstName}
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
      {quickReplies?.length ? (
        <div role="group" aria-label="Quick replies" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {quickReplies.map((text) => (
            <button
              key={text}
              type="button"
              className="min-h-12 shrink-0 rounded-pill border border-line bg-paper px-3 text-small font-bold whitespace-nowrap text-grass-text"
              onClick={() => {
                const el = box.current;
                if (!el) return;
                el.value = el.value.trim() ? `${el.value.trimEnd()} ${text}` : text;
                el.focus();
              }}
            >
              {text}
            </button>
          ))}
        </div>
      ) : null}
      {media && attach ? <MediaPicker key={sent} /> : null}
      <div className="flex items-end gap-2">
        {media ? (
          <button
            type="button"
            aria-label="Attach photos or videos"
            aria-pressed={attach}
            onClick={() => setAttach((on) => !on)}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-pill border border-line ${attach ? "bg-grass-tint text-grass-text" : "bg-paper text-ink-muted"}`}
          >
            <Paperclip aria-hidden size={20} />
          </button>
        ) : null}
        <label htmlFor="chat-body" className="sr-only">
          Message
        </label>
        <textarea
          ref={box}
          id="chat-body"
          name="body"
          rows={1}
          maxLength={BODY_MAX}
          placeholder={placeholder}
          className="max-h-40 min-h-12 flex-1 resize-none rounded-[24px] border border-line bg-paper px-4 py-3 text-body leading-[22px] text-ink placeholder:text-ink-muted focus:border-grass"
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight + 2}px`;
          }}
        />
        <button type="submit" aria-label="Send" disabled={pending} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-pill bg-grass text-on-grass disabled:opacity-60">
          <SendHorizontal aria-hidden size={20} />
        </button>
      </div>
      <p role="status" className="sr-only">
        {pending ? "Sending" : state.saved ? "Sent" : ""}
      </p>
    </form>
  );
}
