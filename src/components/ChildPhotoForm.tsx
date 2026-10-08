"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { removeChildPhoto, saveChildPhoto, type PhotoFormState } from "@/lib/parent/actions";
import { MAX_FILE_BYTES, photoTooBig } from "@/lib/files";
import { shrinkPhoto } from "@/lib/photo-resize";
import { ChildAvatar } from "./ChildAvatar";

// Player → a child's details → "Photo for the coaches". Plain forms posting server actions, so they work before the
// page has loaded (the photo as taken, up to 8 MB). With JavaScript, choosing a photo sends it straight away, shrunk
// to a 512px JPEG first (`resized=1`).

export function ChildPhotoForm({ child }: { child: { id: string; firstName: string; lastName: string; photoId: string | null } }) {
  const [saved, save, saving] = useActionState<PhotoFormState, FormData>(saveChildPhoto, {});
  const [removed, remove, removing] = useActionState<PhotoFormState, FormData>(removeChildPhoto, {});
  const [problem, setProblem] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  // Which form was used last, so its message shows (not an older one from the other).
  const [which, setWhich] = useState<"save" | "remove">("save");
  const last = which === "save" ? saved : removed;
  const busy = saving || removing || preparing;
  const has = Boolean(child.photoId);

  const send = async (form: HTMLFormElement) => {
    const data = new FormData(form);
    const file = data.get("photo");
    setWhich("save");
    if (!(file instanceof File) || file.size === 0) return setProblem("Choose a photo first.");
    setProblem(null);
    setPreparing(true);
    const small = await shrinkPhoto(file);
    setPreparing(false);
    if (small) {
      data.set("photo", new File([small], "photo.jpg", { type: "image/jpeg" }));
      data.set("resized", "1");
    } else if (file.size > MAX_FILE_BYTES) {
      return setProblem(photoTooBig(file.size));
    }
    startTransition(() => save(data));
  };
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void send(e.currentTarget);
  };

  const error = problem ?? last.error;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <ChildAvatar photoId={child.photoId} firstName={child.firstName} lastName={child.lastName} size={96} />
        <p className="text-[15px] leading-[22px]">{has ? `This is the photo the coaches see beside ${child.firstName}'s name.` : `No photo of ${child.firstName} yet.`}</p>
      </div>
      {/* A new key after each change clears the chosen file. */}
      <form key={child.photoId ?? "none"} action={save} onSubmit={onSubmit} className="flex flex-col gap-2" noValidate>
        <input type="hidden" name="child" value={child.id} />
        <label htmlFor="photo" className="field-label">
          {has ? "Change photo" : "Add photo"}
        </label>
        <input
          id="photo"
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          disabled={busy}
          onChange={(e) => {
            if (e.currentTarget.files?.length) e.currentTarget.form?.requestSubmit();
          }}
          className="field py-3 text-[15px]"
        />
        <button type="submit" className="btn-chunky btn-grass" disabled={busy}>
          {preparing || saving ? "Saving photo…" : "Save photo"}
        </button>
      </form>
      {has ? (
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
          <input type="hidden" name="child" value={child.id} />
          <button type="submit" className="btn-chunky btn-paper w-full" disabled={busy} aria-label={`Remove photo of ${child.firstName}`}>
            {removing ? "Removing…" : "Remove photo"}
          </button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px] leading-[22px] text-ink">
          {error}
        </p>
      ) : last.saved && !busy ? (
        <p role="status" className="rounded-app bg-grass-tint px-3.5 py-3 text-[15px] font-bold text-grass-text">
          {last.saved === "added" ? "Photo saved. The coaches will see it on the register." : "Photo removed."}
        </p>
      ) : null}
    </div>
  );
}
