"use client";

import { useActionState, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Eye, Mail, Pencil } from "lucide-react";
import { submitKeepingInput } from "@/components/submitKeepingInput";
import type { FormState } from "@/lib/admin/actions";

const noSubscribe = () => () => {};

/**
 * The news post form. With JavaScript, "Preview" first shows the post as parents will see it and who it goes to
 * ("This goes to 91 parents."), with "Post to parents" and "Email me a test" (to the person writing, nobody else);
 * "Edit" goes back. Without JavaScript the plain "Post to parents" posts straight away, as before.
 * Posting redirects to the post's page; a test keeps everything typed.
 */
export function NewsComposeForm({ action, children }: { action: (prev: FormState, formData: FormData) => Promise<FormState>; children: ReactNode }) {
  const [state, run, pending] = useActionState<FormState, FormData>(action, {});
  const live = useSyncExternalStore(noSubscribe, () => true, () => false);
  const form = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<{ topic: string; title: string; body: string; reach: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const openPreview = () => {
    const f = form.current;
    if (!f) return;
    const data = new FormData(f);
    const title = String(data.get("title") ?? "").trim();
    const body = String(data.get("body") ?? "").trim();
    if (!title) return setProblem("Add a headline.");
    if (!body) return setProblem("Write the message.");
    setProblem(null);
    // The audience's live line ("This goes to 14 parents in U7.") says exactly who it reaches.
    const reach = f.querySelector("[data-news-reach]")?.textContent?.trim() ?? "";
    setPreview({ topic: String(data.get("topic") ?? ""), title, body, reach });
    requestAnimationFrame(() => f.querySelector<HTMLElement>("[data-preview]")?.focus());
  };

  // A refusal from the server (no audience chosen, say) goes back to the form, where it can be fixed.
  const [seen, setSeen] = useState<FormState>(state);
  if (state !== seen) {
    setSeen(state);
    if (state.error) setPreview(null);
  }
  const error = problem ?? (state.error && !pending ? state.error : null);
  return (
    <form ref={form} action={run} onSubmit={submitKeepingInput(run)} className="flex flex-col gap-4" noValidate>
      <div className={preview ? "hidden" : "contents"}>{children}</div>
      {preview ? (
        <section data-preview tabIndex={-1} aria-label="Preview" className="flex flex-col gap-3 outline-none">
          <p className="text-label text-ink-muted uppercase">How parents will see it</p>
          <div className="flex flex-col gap-2 rounded-app border-2 border-crest-gold bg-gold-tint p-4">
            <p className="text-label text-kit-orange uppercase">{preview.topic}</p>
            <h3 className="text-[19px] leading-[25px] font-bold">{preview.title}</h3>
            <p className="text-[15px] leading-[22px] whitespace-pre-line">{preview.body}</p>
          </div>
          {preview.reach ? <p className="rounded-app bg-cream px-3.5 py-2.5 text-[15px] font-bold">{preview.reach}</p> : null}
        </section>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px] text-ink">
          {error}
        </p>
      ) : null}
      {state.saved && !pending ? (
        <p role="status" className="rounded-app bg-grass-tint px-3.5 py-3 text-[15px] font-bold text-grass-text">
          {state.message}
        </p>
      ) : null}
      {!live ? (
        <button type="submit" name="intent" value="post" className="btn-chunky btn-grass self-start">
          Post to parents
        </button>
      ) : preview ? (
        <div className="flex flex-wrap gap-3">
          <button type="submit" name="intent" value="post" className="btn-chunky btn-grass" disabled={pending}>
            {pending ? "Posting…" : "Post to parents"}
          </button>
          <button type="submit" name="intent" value="test" className="btn-chunky btn-paper" disabled={pending}>
            <Mail aria-hidden size={18} />
            Email me a test
          </button>
          <button type="button" onClick={() => setPreview(null)} className="btn-chunky btn-paper" disabled={pending}>
            <Pencil aria-hidden size={18} />
            Edit
          </button>
        </div>
      ) : (
        <button type="button" onClick={openPreview} className="btn-chunky btn-grass self-start">
          <Eye aria-hidden size={18} />
          Preview
        </button>
      )}
    </form>
  );
}
