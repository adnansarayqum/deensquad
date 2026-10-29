"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ImagePlus, Play, X } from "lucide-react";
import type { MediaItem } from "@/lib/media/data";
import { IMAGE_SIDE, MAX_IMAGE_BYTES, MAX_MEDIA_ITEMS, MAX_VIDEO_BYTES, durationText, imageTooBig, videoTooBig } from "@/lib/media/limits";
import { shrinkPhoto } from "@/lib/photo-resize";

// "Photos and videos" on the news form, a session's Edit page and staff's message box. With JavaScript each file is
// sent as soon as it's chosen (POST /api/media-upload: pictures shrunk in the browser first, videos as they are, with
// a progress bar), and the form carries only their ids (`media`), in order; sending the form while one is still
// uploading is stopped with a message. Without JavaScript it's a plain file box (`mediaFile`) sent with the form,
// within the 9 MB form limit.

const noSubscribe = () => () => {};

type Tile = {
  key: string;
  kind: "image" | "video";
  status: "uploading" | "done" | "error";
  progress: number;
  /** A preview from the phone itself while it uploads (pictures only). */
  local: string | null;
  media: MediaItem | null;
  error: string | null;
};

function fromItem(m: MediaItem): Tile {
  return { key: m.id, kind: m.kind, status: "done", progress: 1, local: null, media: m, error: null };
}

function upload(body: Blob, onProgress: (p: number) => void): Promise<MediaItem> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media-upload");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      const res = xhr.response as (MediaItem & { error?: string }) | null;
      if (xhr.status === 200 && res?.id) resolve(res);
      else if (xhr.status === 401) reject(new Error("Your sign-in has run out. Sign in again in another tab, then try again."));
      else reject(new Error(res?.error ?? "That didn't upload. Try again."));
    };
    xhr.onerror = () => reject(new Error("That didn't upload. Check your signal and try again."));
    xhr.send(body);
  });
}

export function MediaPicker({ initial = [], hint }: { initial?: MediaItem[]; hint?: string }) {
  const live = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [tiles, setTiles] = useState<Tile[]>(() => initial.map(fromItem));
  const [problem, setProblem] = useState<string | null>(null);
  const box = useRef<HTMLFieldSetElement>(null);
  const uploading = tiles.some((t) => t.status === "uploading");
  const queue = useRef<Promise<void>>(Promise.resolve());

  const patch = (key: string, p: Partial<Tile>) => setTiles((all) => all.map((t) => (t.key === key ? { ...t, ...p } : t)));

  // A form sent mid-upload would go without that picture, so it's held back until they've all finished.
  useEffect(() => {
    const form = box.current?.closest("form");
    if (!form || !uploading) return;
    const hold = (e: SubmitEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      setProblem("Wait for the photos and videos to finish uploading, then send it.");
      box.current?.querySelector<HTMLElement>("[data-media-problem]")?.focus();
    };
    form.addEventListener("submit", hold, true);
    return () => form.removeEventListener("submit", hold, true);
  }, [uploading]);

  // Object URLs for previews are freed when the picker goes.
  const locals = useRef<string[]>([]);
  useEffect(() => () => locals.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const add = (files: FileList | null) => {
    if (!files?.length) return;
    setProblem(null);
    const room = MAX_MEDIA_ITEMS - tiles.filter((t) => t.status !== "error").length;
    const chosen = [...files].slice(0, Math.max(0, room));
    if (files.length > chosen.length) setProblem(`Up to ${MAX_MEDIA_ITEMS} photos and videos. The rest weren't added.`);
    for (const file of chosen) {
      const key = crypto.randomUUID();
      const kind: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
      const tooBig = kind === "video" && file.size > MAX_VIDEO_BYTES ? videoTooBig(file.size) : null;
      const local = kind === "image" ? URL.createObjectURL(file) : null;
      if (local) locals.current.push(local);
      setTiles((all) => [...all, { key, kind, status: tooBig ? "error" : "uploading", progress: 0, local, media: null, error: tooBig }]);
      if (tooBig) continue;
      // One at a time, so a phone on 4G isn't sending five videos at once.
      queue.current = queue.current.then(async () => {
        try {
          let body: Blob = file;
          if (kind === "image") {
            const small = await shrinkPhoto(file, IMAGE_SIDE);
            if (small) body = small;
            else if (file.size > MAX_IMAGE_BYTES) throw new Error(imageTooBig(file.size));
          }
          const media = await upload(body, (p) => patch(key, { progress: p }));
          patch(key, { status: "done", progress: 1, media });
        } catch (e) {
          patch(key, { status: "error", error: e instanceof Error ? e.message : "That didn't upload. Try again." });
        }
      });
    }
  };

  const remove = (key: string) => setTiles((all) => all.filter((t) => t.key !== key));
  const done = tiles.filter((t) => t.status === "done" && t.media);
  const label = (t: Tile, i: number) => `${t.kind === "video" ? "video" : "photo"} ${i + 1}`;

  return (
    <fieldset ref={box} className="flex flex-col gap-2" data-media-picker data-media-items={JSON.stringify(done.map((t) => t.media))}>
      <legend className="field-label">
        Photos and videos <span className="font-normal text-ink-muted">(optional)</span>
      </legend>
      {hint ? <p className="-mt-1 text-[13px] text-ink-muted">{hint}</p> : null}
      {done.map((t) => (
        <input key={t.key} type="hidden" name="media" value={t.media!.id} />
      ))}
      {tiles.length ? (
        <ul className="grid grid-cols-3 gap-2" aria-label="Photos and videos added">
          {tiles.map((t, i) => (
            <li key={t.key} className="relative aspect-square overflow-hidden rounded-dash border-2 border-line bg-cream">
              {t.local || (t.media && (t.kind === "image" || t.media.poster)) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={t.local ?? `/api/media/${t.media!.id}${t.kind === "video" ? "?poster=1" : ""}`}
                  alt=""
                  className={`h-full w-full object-cover ${t.status === "error" ? "opacity-40" : ""}`}
                />
              ) : null}
              {t.kind === "video" && t.status !== "error" ? (
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[13px] font-bold">
                  <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-pitch-deep text-on-pitch">
                    <Play aria-hidden size={16} />
                  </span>
                  {t.media ? <span className="rounded-pill bg-paper px-2">{durationText(t.media.duration) ?? "Video"}</span> : null}
                </span>
              ) : null}
              {t.status === "uploading" ? (
                <span className="absolute inset-x-2 bottom-2 flex flex-col gap-1">
                  <span className="sr-only">{`Uploading ${label(t, i)}: ${Math.round(t.progress * 100)}%`}</span>
                  <span aria-hidden className="h-2 overflow-hidden rounded-pill bg-paper">
                    <span className="block h-full bg-grass" style={{ width: `${Math.max(4, Math.round(t.progress * 100))}%` }} />
                  </span>
                </span>
              ) : null}
              {t.status === "error" ? (
                <span role="alert" className="absolute inset-0 overflow-y-auto bg-orange-tint p-2 pr-12 text-[13px] leading-[17px] text-ink">
                  {t.error}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => remove(t.key)}
                className="absolute top-0 right-0 flex h-12 w-12 items-start justify-end p-1.5"
                aria-label={`Remove ${label(t, i)}`}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-pill bg-pitch-deep text-on-pitch">
                  <X aria-hidden size={16} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {problem ? (
        <p data-media-problem tabIndex={-1} role="alert" className="rounded-app bg-orange-tint px-3.5 py-2.5 text-[15px] text-ink outline-none">
          {problem}
        </p>
      ) : null}
      {live ? (
        tiles.length < MAX_MEDIA_ITEMS ? (
          <label className="btn-chunky btn-paper relative cursor-pointer self-start has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[var(--focus)]">
            <ImagePlus aria-hidden size={18} />
            {tiles.length ? "Add more" : "Add photos or videos"}
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              className="sr-only"
              onChange={(e) => {
                add(e.currentTarget.files);
                e.currentTarget.value = "";
              }}
            />
          </label>
        ) : null
      ) : (
        <input type="file" name="mediaFile" accept="image/*,video/*" multiple className="text-[15px]" aria-label="Photos and videos (up to 8 MB in all)" />
      )}
    </fieldset>
  );
}
