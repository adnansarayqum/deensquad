"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MediaPicker } from "@/components/media/MediaPicker";
import { useKeptActionState } from "@/components/submitKeepingInput";
import type { MessageFormState } from "@/lib/messages/actions";
import { BODY_MAX } from "@/lib/messages/limits";

/**
 * Write a message: a reply in a conversation, or the first message of a new one (with `children` for the child
 * picker and subject). A plain form posting a server action, so it works before the page's script has loaded;
 * `submitKeepingInput` keeps what was typed when the action refuses, and a sent reply clears the box.
 */
export function MessageForm({
  action,
  hidden,
  label = "Your message",
  submitLabel = "Send",
  placeholder,
  children,
  compact = false,
  media = false,
  quickReplies,
}: {
  action: (prev: MessageFormState, formData: FormData) => Promise<MessageFormState>;
  hidden: Record<string, string>;
  label?: string;
  submitLabel?: string;
  placeholder?: string;
  children?: ReactNode;
  /** A reply under a thread: two lines that grow as you type, with Send beside the box so it's always in reach. */
  compact?: boolean;
  /** Staff only: "Add photos or videos" above the box (src/components/media). */
  media?: boolean;
  /** Staff only: replies typed often, one tap to put in the box (still checked and sent by hand). Needs JavaScript. */
  quickReplies?: readonly string[];
}) {
  const [state, run, pending, keep] = useKeptActionState<MessageFormState>(action, {});
  const form = useRef<HTMLFormElement>(null);
  // A sent message starts the picker afresh (its uploads went with it).
  const [sent, setSent] = useState(0);
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.saved) setSent((n) => n + 1);
  }
  useEffect(() => {
    if (!state.saved) return;
    form.current?.reset();
    const box = form.current?.querySelector("textarea");
    if (box) box.style.height = "";
  }, [state]);
  return (
    <form ref={form} action={run} onSubmit={keep} className="flex flex-col gap-3" noValidate>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      {media ? <MediaPicker key={sent} /> : null}
      {compact ? (
        <div>
          <label htmlFor="message-body" className="field-label">
            {label}
          </label>
          {quickReplies?.length ? (
            <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Quick replies">
              {quickReplies.map((text) => (
                <button
                  key={text}
                  type="button"
                  className="min-h-12 rounded-pill border border-line bg-paper px-3 text-left text-small font-bold text-grass-text"
                  onClick={() => {
                    const box = form.current?.querySelector("textarea");
                    if (!box) return;
                    box.value = box.value.trim() ? `${box.value.trimEnd()} ${text}` : text;
                    box.focus();
                  }}
                >
                  {text}
                </button>
              ))}
            </div>
          ) : null}
          {/* The box takes the full width, Send under it (messaging review, Nov 2026: beside the button it was cramped). */}
          <div className="flex flex-col gap-2">
            <textarea
              id="message-body"
              name="body"
              rows={2}
              maxLength={BODY_MAX}
              className="field max-h-48 min-h-12 w-full resize-none"
              placeholder={placeholder}
              onInput={(e) => {
                // Grow with the text, up to about eight lines; then it scrolls.
                const box = e.currentTarget;
                box.style.height = "auto";
                box.style.height = `${box.scrollHeight + 4}px`;
              }}
            />
            <button type="submit" className="btn-chunky btn-grass self-end" disabled={pending}>
              {pending ? "Sending…" : submitLabel}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <label htmlFor="message-body" className="field-label">
            {label}
          </label>
          <textarea id="message-body" name="body" rows={4} maxLength={BODY_MAX} className="field" placeholder={placeholder} />
        </div>
      )}
      {state.error ? (
        <p role="alert" className="rounded-app bg-orange-tint px-3.5 py-3 text-small leading-[22px] text-ink">
          {state.error}
        </p>
      ) : null}
      {state.saved && !pending ? (
        <p role="status" className="rounded-app bg-grass-tint px-3.5 py-3 text-small font-bold text-grass-text">
          Sent.
        </p>
      ) : null}
      {compact ? null : (
        <button type="submit" className="btn-chunky btn-grass self-start" disabled={pending}>
          {pending ? "Sending…" : submitLabel}
        </button>
      )}
    </form>
  );
}
