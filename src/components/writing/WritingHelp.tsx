"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Mic, Sparkles, Square, Undo2 } from "lucide-react";
import { draftWithAI } from "@/lib/ai/actions";

// Speak instead of typing (the browser's own speech recognition, en-GB), then optionally let Claude
// tidy the words into a plan, post or sheet. Both only change the text box; the coach still saves it.

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

const noop = () => () => {};

function field(id: string) {
  return document.getElementById(id) as HTMLTextAreaElement | HTMLInputElement | null;
}

function setValue(id: string, value: string) {
  const el = field(id);
  if (!el) return;
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export function WritingHelp({
  bodyId,
  titleId,
  kind,
  ai,
  context,
}: {
  bodyId: string;
  titleId?: string;
  kind: "plan" | "news" | "practice" | "note";
  ai: boolean;
  context?: string;
}) {
  const canDictate = useSyncExternalStore(
    noop,
    () => recognitionCtor() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [undo, setUndo] = useState<{ title?: string; body: string } | null>(null);
  const [pending, start] = useTransition();
  const rec = useRef<Recognition | null>(null);

  useEffect(() => () => rec.current?.stop(), []);

  function toggleDictation() {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const Ctor = recognitionCtor();
    const el = field(bodyId);
    if (!Ctor || !el) return;
    const before = el.value.trim();
    const r = new Ctor();
    r.lang = "en-GB";
    r.continuous = true;
    r.interimResults = true;
    let finals = "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) finals += `${result[0].transcript.trim()} `;
        else interim += result[0].transcript;
      }
      setValue(bodyId, [before, `${finals}${interim}`.trim()].filter(Boolean).join(before ? "\n" : ""));
    };
    r.onerror = (e) => {
      setMessage({ tone: "error", text: e.error === "not-allowed" ? "Allow the microphone for this site to dictate." : "Dictation stopped. Tap the mic to carry on." });
    };
    r.onend = () => setListening(false);
    rec.current = r;
    setMessage(null);
    setListening(true);
    r.start();
  }

  function tidy() {
    rec.current?.stop();
    const body = field(bodyId)?.value ?? "";
    const title = titleId ? (field(titleId)?.value ?? "") : undefined;
    setMessage(null);
    start(async () => {
      const notes = title ? `${title}\n${body}` : body;
      const result = await draftWithAI(kind, notes, context);
      if (result.error || !result.body) {
        setMessage({ tone: "error", text: result.error ?? "The AI couldn't help just now." });
        return;
      }
      setUndo({ title, body });
      setValue(bodyId, result.body);
      if (titleId && result.title) setValue(titleId, result.title);
      setMessage({ tone: "info", text: "Here's a tidied draft. Check it and change anything before you save." });
    });
  }

  function restore() {
    if (!undo) return;
    setValue(bodyId, undo.body);
    if (titleId && undo.title !== undefined) setValue(titleId, undo.title);
    setUndo(null);
    setMessage(null);
  }

  if (!canDictate && !ai) return null;
  const chip = "inline-flex min-h-11 items-center gap-1.5 rounded-pill border-2 px-3.5 text-sm font-extrabold disabled:opacity-60";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {canDictate ? (
          <button
            type="button"
            onClick={toggleDictation}
            aria-pressed={listening}
            className={`${chip} ${listening ? "border-kit-orange bg-orange-tint text-kit-orange" : "border-line bg-paper text-ink"}`}
          >
            {listening ? <Square aria-hidden size={14} fill="currentColor" /> : <Mic aria-hidden size={16} />}
            {listening ? "Stop" : "Dictate"}
          </button>
        ) : null}
        {ai ? (
          <button type="button" onClick={tidy} disabled={pending || listening} className={`${chip} border-grass bg-grass-tint text-grass-text`}>
            <Sparkles aria-hidden size={16} />
            {pending ? "Tidying…" : "Tidy up with AI"}
          </button>
        ) : null}
        {undo ? (
          <button type="button" onClick={restore} className={`${chip} border-line bg-paper text-ink-muted`}>
            <Undo2 aria-hidden size={16} />
            Undo
          </button>
        ) : null}
      </div>
      {ai ? <p className="text-sm text-ink-muted">First names only. Don&apos;t include children&apos;s surnames.</p> : null}
      {listening ? (
        <p role="status" className="text-sm text-ink-muted">
          Listening. Speak normally; your words appear in the box.
        </p>
      ) : null}
      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={`rounded-xl px-3 py-2 text-sm ${message.tone === "error" ? "bg-orange-tint" : "bg-grass-tint text-grass-text"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

/** On the practice page: draft a home sheet from one of this week's session plans. */
export function PracticeFromPlan({ plans, titleId, bodyId }: { plans: { id: string; label: string; text: string }[]; titleId: string; bodyId: string }) {
  const [choice, setChoice] = useState(plans[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (plans.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-grass-tint p-3">
      <label htmlFor="fromPlan" className="text-sm font-extrabold text-grass-text">
        Or let AI draft one from a session plan
      </label>
      <div className="flex gap-2">
        <select id="fromPlan" value={choice} onChange={(e) => setChoice(e.target.value)} className="field min-w-0 flex-1">
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const plan = plans.find((p) => p.id === choice);
              const result = await draftWithAI("practiceFromPlan", plan?.text ?? "", plan?.label);
              if (result.error || !result.body) return setError(result.error ?? "The AI couldn't help just now.");
              setValue(bodyId, result.body);
              if (result.title) setValue(titleId, result.title);
            })
          }
          className="btn-chunky btn-grass btn-small shrink-0"
        >
          <Sparkles aria-hidden size={16} />
          {pending ? "Drafting…" : "Draft"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
