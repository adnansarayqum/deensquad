"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { MAX_FILE_BYTES } from "@/lib/files";
import { removeVenuePass, saveVenuePass, type VenuePassState } from "@/lib/venue-pass/actions";
import type { VenuePassView } from "@/lib/venue-pass/card";
import { readScreenshot } from "@/lib/venue-pass/read-screenshot";
import { VenuePassPicture } from "./VenuePassPicture";

// /pass → "Your sports hub entry code": the parent's own entry QR code for Bobby Moore Sports Hub, kept here so it's
// on screen at the gate with the children's codes. Plain forms posting server actions, so a screenshot can be saved
// before the page has loaded (stored as it is). With JavaScript, the phone reads the QR code in the screenshot and
// sends only its text, which the app draws again crisp; when it can't, the screenshot is sent instead.

export function VenuePassCard({ view }: { view: VenuePassView | null }) {
  const [saved, save, saving] = useActionState<VenuePassState, FormData>(saveVenuePass, {});
  const [removed, remove, removing] = useActionState<VenuePassState, FormData>(removeVenuePass, {});
  const [problem, setProblem] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  // Which form was used last, so its message shows (not an older one from the other).
  const [which, setWhich] = useState<"save" | "remove">("save");
  const last = which === "save" ? saved : removed;
  const busy = saving || removing || reading;

  const send = async (form: HTMLFormElement) => {
    const file = new FormData(form).get("screenshot");
    setWhich("save");
    if (!(file instanceof File) || file.size === 0) return setProblem("Choose a screenshot first.");
    setProblem(null);
    setReading(true);
    const result = await readScreenshot(file);
    setReading(false);
    const data = new FormData();
    if (result && "text" in result) data.set("code", result.text);
    else if (result) data.set("screenshot", new File([result.image], "screenshot.png", { type: "image/png" }));
    else if (file.size > MAX_FILE_BYTES) return setProblem("That picture is too big. The limit is 8 MB. Try a screenshot.");
    else data.set("screenshot", file);
    startTransition(() => save(data));
  };
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void send(e.currentTarget);
  };

  const error = problem ?? last.error;
  const message =
    last.saved === "code"
      ? "Saved. Your code is ready for the gate."
      : last.saved === "image"
        ? "We couldn't read the QR code in that screenshot, so it's saved as it is. Check the whole code shows."
        : last.saved === "removed"
          ? "Your sports hub entry code is removed."
          : null;

  return (
    <section aria-labelledby="hub-code" className="flex w-full flex-col gap-3 rounded-app border-2 border-line bg-paper p-4">
      <h2 id="hub-code" className="text-[17px] font-extrabold">
        Your sports hub entry code
      </h2>
      {view ? (
        <>
          <VenuePassPicture view={view} />
          <p className="text-sm leading-5 text-ink-muted">
            Show this at the Bobby Moore Sports Hub entrance. Only you can see it: not the club or the coaches.{" "}
            {view.kind === "code" || view.offline
              ? "This phone keeps a copy for when there's no signal."
              : "This screenshot is too big to keep on the phone for no signal, so keep your own copy too."}
          </p>
        </>
      ) : (
        <p className="text-[15px] leading-[22px]">
          Add your Bobby Moore Sports Hub entry code (from your screenshots) so it&apos;s here at the gate. Only you can see it: not the club or the
          coaches.
        </p>
      )}

      {/* A new key after each change clears the chosen file. */}
      <form key={view?.savedAt ?? "none"} action={save} onSubmit={onSubmit} className="flex flex-col gap-2" noValidate>
        <label htmlFor="hub-screenshot" className="field-label">
          {view ? "Replace screenshot" : "Add screenshot"}
        </label>
        <input
          id="hub-screenshot"
          name="screenshot"
          type="file"
          accept="image/*"
          disabled={busy}
          onChange={(e) => {
            if (e.currentTarget.files?.length) e.currentTarget.form?.requestSubmit();
          }}
          className="field py-3 text-[15px]"
        />
        <button type="submit" className={view ? "btn-chunky btn-paper" : "btn-chunky btn-grass"} disabled={busy}>
          {reading ? "Reading the code…" : saving ? "Saving…" : "Save screenshot"}
        </button>
      </form>
      {view ? (
        <form
          action={remove}
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            setWhich("remove");
            setProblem(null);
            startTransition(() => remove(data));
          }}
        >
          <button type="submit" className="btn-chunky btn-paper w-full" disabled={busy} aria-label="Remove your sports hub entry code">
            {removing ? "Removing…" : "Remove"}
          </button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px] leading-[22px] text-ink">
          {error}
        </p>
      ) : message && !busy ? (
        <p role="status" className="rounded-app bg-grass-tint px-3.5 py-3 text-[15px] font-bold text-grass-text">
          {message}
        </p>
      ) : null}
    </section>
  );
}
