"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { Check, Mic, Send, Square, X } from "lucide-react";
import { confirmDraft, dismissAssistantDraft, type DraftOutcome } from "@/lib/assistant/actions";
import type { Draft } from "@/lib/assistant/tools";

// The admins' assistant: a conversation with Claude about the club's own data (src/lib/assistant). Questions go to
// POST /api/admin/assistant; drafted changes come back as cards with Confirm / Not now, and nothing changes until
// Confirm. Speak instead of typing with Dictate (the browser's speech recognition, en-GB). The conversation lives on
// this screen only; reloading starts afresh.

type Entry =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; drafts: Draft[] }
  | { role: "problem"; text: string };

const SUGGESTIONS = [
  "Who hasn't answered for the next session?",
  "Which children have no payment plan?",
  "How is attendance this season?",
  "Add U10 training every Friday in November, 6:30pm to 8pm",
];

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
type RecognitionCtor = new () => Recognition;
function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
const noSubscribe = () => () => {};

/** The assistant's words, with "- " lists, **bold** and [label](/admin/…) links to the app's own pages only. */
function Rich({ text }: { text: string }) {
  const inline = (line: string, key: string): ReactNode[] => {
    const out: ReactNode[] = [];
    const pattern = /\[([^\]]+)\]\((\/[^)\s]*)\)|\*\*([^*]+)\*\*/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = pattern.exec(line))) {
      if (m.index > last) out.push(line.slice(last, m.index));
      if (m[1] && /^\/(admin|coach)(\/|$|\?)/.test(m[2])) {
        out.push(
          <Link key={`${key}-${i++}`} href={m[2]} className="font-bold text-grass-text underline">
            {m[1]}
          </Link>,
        );
      } else if (m[1]) out.push(m[1]);
      else out.push(<b key={`${key}-${i++}`}>{m[3]}</b>);
      last = pattern.lastIndex;
    }
    if (last < line.length) out.push(line.slice(last));
    return out;
  };
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = (k: number) => {
    if (!list.length) return;
    blocks.push(
      <ul key={`l${k}`} className="flex list-disc flex-col gap-1 pl-5">
        {list.map((item, j) => (
          <li key={j}>{inline(item, `l${k}-${j}`)}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  text.split("\n").forEach((raw, k) => {
    const line = raw.trimEnd();
    const item = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (item) return void list.push(item[1]);
    flush(k);
    if (line.trim()) blocks.push(<p key={`p${k}`}>{inline(line, `p${k}`)}</p>);
  });
  flush(-1);
  return <div className="flex flex-col gap-2 text-[15px] leading-[22px] break-words">{blocks}</div>;
}

function DraftCard({ draft }: { draft: Draft }) {
  const [outcome, setOutcome] = useState<DraftOutcome | null>(null);
  const [which, setWhich] = useState<"confirm" | "dismiss" | null>(null);
  const [pending, start] = useTransition();
  const act = (kind: "confirm" | "dismiss") => {
    setWhich(kind);
    start(async () => {
      try {
        setOutcome(await (kind === "confirm" ? confirmDraft(draft.id) : dismissAssistantDraft(draft.id)));
      } catch {
        setOutcome({ ok: false, message: "That didn't save. Check your signal and try again." });
        setWhich(null);
      }
    });
  };
  const done = outcome?.ok;
  return (
    <section aria-label={`Draft: ${draft.summary}`} className="flex flex-col gap-2 rounded-app border-2 border-crest-gold bg-gold-tint p-3.5">
      <p className="text-label text-gold-text uppercase">{done ? (which === "confirm" ? "Done" : "Not done") : "Check, then confirm"}</p>
      <p className="text-[16px] leading-[22px] font-bold">{draft.summary}</p>
      <ul className="flex flex-col gap-1 text-[14px] leading-5 whitespace-pre-line">
        {draft.lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      {outcome ? (
        <p role="status" className={`rounded-app px-3 py-2 text-[15px] font-bold ${outcome.ok ? "bg-grass-tint text-grass-text" : "bg-orange-tint text-ink"}`}>
          {outcome.message}
          {outcome.link ? (
            <>
              {" "}
              <Link href={outcome.link} className="underline">
                Open
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      {done ? null : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => act("confirm")} disabled={pending} className="btn-chunky btn-grass" aria-label={`Confirm: ${draft.summary}`}>
            <Check aria-hidden size={18} />
            {pending && which === "confirm" ? "Doing it…" : "Confirm"}
          </button>
          <button type="button" onClick={() => act("dismiss")} disabled={pending} className="btn-chunky btn-paper" aria-label={`Not now: ${draft.summary}`}>
            <X aria-hidden size={18} />
            Not now
          </button>
        </div>
      )}
    </section>
  );
}

export function AssistantChat() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draftText, setDraftText] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const canDictate = useSyncExternalStore(noSubscribe, () => recognitionCtor() !== null, () => false);
  const rec = useRef<Recognition | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => () => rec.current?.stop(), []);
  // In braces: newer Chrome returns a Promise from scrollIntoView, and an effect that returns anything but a cleanup
  // function crashes React when it next runs ("i is not a function", the assistant's first answer on 31 Oct 2026).
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [entries, busy]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    rec.current?.stop();
    const history = entries.flatMap((e) => (e.role === "user" || e.role === "assistant" ? [{ role: e.role, text: e.text }] : []));
    setEntries((all) => [...all, { role: "user", text: q }]);
    setDraftText("");
    setBusy(true);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120_000);
      const res = await fetch("/api/admin/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: q, history }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
      const data = (await res.json().catch(() => null)) as { reply?: string; drafts?: Draft[]; error?: string } | null;
      if (!res.ok || !data?.reply) throw new Error(data?.error ?? "The assistant didn't answer. Check your signal and try again.");
      setEntries((all) => [...all, { role: "assistant", text: data.reply!, drafts: data.drafts ?? [] }]);
    } catch (e) {
      const message = e instanceof Error && e.name !== "AbortError" ? e.message : "The assistant didn't answer. Check your signal and try again.";
      setEntries((all) => [...all, { role: "problem", text: message }]);
      setDraftText(q);
    } finally {
      setBusy(false);
      box.current?.focus();
    }
  };

  const dictate = () => {
    if (listening) return rec.current?.stop();
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const before = draftText.trim();
    const r = new Ctor();
    r.lang = "en-GB";
    r.continuous = true;
    r.interimResults = true;
    let finals = "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finals += t;
        else interim += t;
      }
      setDraftText([before, (finals + interim).trim()].filter(Boolean).join(" "));
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  };

  return (
    <div className="flex flex-col gap-4">
      {entries.length === 0 ? (
        <section aria-labelledby="try" className="flex flex-col gap-2">
          <h2 id="try" className="text-label text-ink-muted uppercase">
            Try asking
          </h2>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => ask(s)} className="min-h-12 rounded-pill border-2 border-line bg-paper px-4 py-2 text-left text-[15px] font-bold">
                {s}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <ol aria-label="Conversation" aria-live="polite" className="flex flex-col gap-3">
        {entries.map((e, i) => (
          <li key={i} className={`flex flex-col gap-2 ${e.role === "user" ? "items-end" : "items-start"}`}>
            {e.role === "user" ? (
              <p className="max-w-[85%] rounded-app border-2 border-grass bg-grass-tint px-3.5 py-2.5 text-[15px] leading-[22px] whitespace-pre-line">
                <span className="sr-only">You: </span>
                {e.text}
              </p>
            ) : e.role === "problem" ? (
              <p role="alert" className="max-w-[92%] rounded-app bg-orange-tint px-3.5 py-2.5 text-[15px] text-ink">
                {e.text}
              </p>
            ) : (
              <Fragment>
                <div className="w-full max-w-[92%] rounded-app border-2 border-line bg-paper px-3.5 py-2.5">
                  <span className="sr-only">Assistant: </span>
                  <Rich text={e.text} />
                </div>
                {e.drafts.map((d) => (
                  <div key={d.id} className="w-full max-w-[92%]">
                    <DraftCard draft={d} />
                  </div>
                ))}
              </Fragment>
            )}
          </li>
        ))}
        {busy ? (
          <li className="self-start rounded-app border-2 border-line bg-paper px-3.5 py-2.5 text-[15px] text-ink-muted" role="status">
            Looking in the app…
          </li>
        ) : null}
      </ol>
      <div ref={end} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(draftText);
        }}
        className="sticky bottom-0 flex flex-col gap-2 border-t-2 border-line bg-cream pt-3 pb-3"
      >
        <label htmlFor="ask" className="field-label">
          Ask about the club
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id="ask"
            ref={box}
            rows={2}
            maxLength={1000}
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void ask(draftText);
              }
            }}
            className="field max-h-40 min-h-12 flex-1 resize-none"
            placeholder="e.g. Has the Khan family paid?"
          />
          {canDictate ? (
            <button type="button" onClick={dictate} className="btn-chunky btn-paper shrink-0" aria-pressed={listening} aria-label={listening ? "Stop dictating" : "Dictate"}>
              {listening ? <Square aria-hidden size={18} /> : <Mic aria-hidden size={18} />}
            </button>
          ) : null}
          <button type="submit" className="btn-chunky btn-grass shrink-0" disabled={busy || !draftText.trim()} aria-label="Send">
            <Send aria-hidden size={18} />
          </button>
        </div>
      </form>
    </div>
  );
}
