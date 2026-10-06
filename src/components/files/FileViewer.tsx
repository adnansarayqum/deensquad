"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileWarning } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { pageCount, pageText, renderScale } from "@/lib/viewer";

type Props = { src: string; downloadHref: string; name: string; mime: string };

/**
 * Shows an attached PDF or photo inside the app, so the installed app never hands the file to a
 * full-screen browser view with no way back. PDFs are drawn page by page with PDF.js (phones can't
 * show a PDF inside a page themselves); photos are a plain image.
 */
export function FileViewer(props: Props) {
  const [attempt, setAttempt] = useState(0);
  // A new key starts the whole viewer again on Try again.
  return props.mime === "application/pdf" ? (
    <PdfViewer key={attempt} {...props} retry={() => setAttempt((n) => n + 1)} />
  ) : (
    <ImageViewer key={attempt} {...props} retry={() => setAttempt((n) => n + 1)} />
  );
}

type Loaded = { doc: PDFDocumentProxy; sizes: { width: number; height: number }[] };

/** The file (or the PDF reader itself) couldn't be fetched: worth trying again with a better signal. */
class NetworkError extends Error {}

/** Why a file couldn't be shown: no signal (try again), or a file this viewer can't read (download it). */
type Failure = "network" | "unreadable";

async function loadPdf(src: string, signal: AbortSignal): Promise<Loaded> {
  let pdfjs: typeof import("pdfjs-dist");
  let data: Uint8Array;
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const res = await fetch(src, { credentials: "same-origin", signal });
    if (!res.ok) throw new Error(`File request failed: ${res.status}`);
    data = new Uint8Array(await res.arrayBuffer());
  } catch (error) {
    throw new NetworkError("Couldn't fetch the file", { cause: error });
  }
  // The worker is bundled with the app (no CDN) and shared by every document opened in this tab.
  if (!pdfjs.GlobalWorkerOptions.workerPort) {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
  }
  // From here on, a failure means PDF.js can't read this file (damaged, or a kind it doesn't support).
  const doc = await pdfjs.getDocument({ data, enableXfa: false }).promise;
  const sizes = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const { width, height } = (await doc.getPage(i)).getViewport({ scale: 1 });
    sizes.push({ width, height });
  }
  return { doc, sizes };
}

function PdfViewer({ src, downloadHref, name, retry }: Props & { retry: () => void }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "ready"; loaded: Loaded } | { status: "error"; failure: Failure }>({ status: "loading" });

  useEffect(() => {
    const abort = new AbortController();
    let loaded: Loaded | null = null;
    loadPdf(src, abort.signal).then(
      (result) => {
        loaded = result;
        if (abort.signal.aborted) void result.doc.loadingTask.destroy();
        else setState({ status: "ready", loaded: result });
      },
      (error: unknown) => {
        if (abort.signal.aborted) return;
        console.error(error);
        setState({ status: "error", failure: error instanceof NetworkError ? "network" : "unreadable" });
      },
    );
    return () => {
      abort.abort();
      void loaded?.doc.loadingTask.destroy();
    };
  }, [src]);

  const texts = usePageTexts(state.status === "ready" ? state.loaded : null);

  if (state.status === "loading") return <Loading label={`Opening ${name}`} />;
  if (state.status === "error") return <Failed failure={state.failure} retry={retry} downloadHref={downloadHref} />;
  const { doc, sizes } = state.loaded;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] font-bold text-ink-muted" aria-live="polite">
        {pageCount(sizes.length)}
      </p>
      {texts === "none" ? <p className="sr-only">This file has no readable text. Download it to open in another app.</p> : null}
      {sizes.map((size, i) => (
        <PdfPage
          key={i}
          doc={doc}
          number={i + 1}
          width={size.width}
          height={size.height}
          total={sizes.length}
          text={Array.isArray(texts) ? texts[i] : ""}
        />
      ))}
    </div>
  );
}

/**
 * The words on each page, for screen readers (the pages themselves are drawn as pictures). "none" when the file has
 * no text layer (a scan or a photo saved as PDF) or PDF.js couldn't read it; null while it's still being read.
 */
function usePageTexts(loaded: Loaded | null): string[] | "none" | null {
  const [texts, setTexts] = useState<string[] | "none" | null>(null);
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    (async () => {
      const pages: string[] = [];
      for (let i = 1; i <= loaded.doc.numPages; i++) pages.push(pageText(await (await loaded.doc.getPage(i)).getTextContent()));
      return pages;
    })().then(
      (pages) => !cancelled && setTexts(pages.some((t) => t.length > 0) ? pages : "none"),
      (error: unknown) => {
        if (cancelled) return;
        console.error(error);
        setTexts("none");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [loaded]);
  return texts;
}

/** One page, drawn when it comes near the screen so a long PDF doesn't fill a phone's memory up front. */
function PdfPage({
  doc,
  number,
  width,
  height,
  total,
  text,
}: {
  doc: PDFDocumentProxy;
  number: number;
  width: number;
  height: number;
  total: number;
  /** The page's words, read out after the page's picture; empty while they're being read or if it has none. */
  text: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState<"waiting" | "drawn" | "failed">("waiting");

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    const draw = async () => {
      try {
        const page = await doc.getPage(number);
        if (cancelled) return;
        const scale = renderScale(width, height, el.clientWidth || width, window.devicePixelRatio);
        const viewport = page.getViewport({ scale });
        el.width = Math.floor(viewport.width);
        el.height = Math.floor(viewport.height);
        const render = page.render({ canvas: el, viewport });
        task = render;
        await render.promise;
        if (!cancelled) setDrawn("drawn");
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        setDrawn("failed");
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          void draw();
        }
      },
      { rootMargin: "100% 0px" },
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
      task?.cancel();
    };
  }, [doc, number, width, height]);

  return (
    <figure className="relative overflow-hidden rounded-web border-2 border-line bg-white">
      <canvas
        ref={canvas}
        role="img"
        aria-label={`Page ${number} of ${total}`}
        data-drawn={drawn}
        className="block h-auto w-full"
        style={{ aspectRatio: `${width} / ${height}` }}
      />
      {text ? <div className="sr-only whitespace-pre-line">{text}</div> : null}
      {drawn === "failed" ? (
        <figcaption className="absolute inset-0 grid place-items-center p-4 text-center text-[15px] text-ink-muted">
          Page {number} couldn&apos;t be shown. Download the file to see it.
        </figcaption>
      ) : null}
    </figure>
  );
}

function ImageViewer({ src, downloadHref, name, retry }: Props & { retry: () => void }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const img = useRef<HTMLImageElement>(null);
  // A cached photo can finish loading before React attaches onLoad.
  useEffect(() => {
    if (img.current?.complete && img.current.naturalWidth > 0) setState("ready");
  }, []);
  // A photo that fails to load is most often a dropped signal.
  if (state === "error") return <Failed failure="network" retry={retry} downloadHref={downloadHref} />;
  return (
    <>
      {state === "loading" ? <Loading label={`Opening ${name}`} /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- the club's own file, behind sign-in */}
      <img
        ref={img}
        src={src}
        alt={name}
        onLoad={() => setState("ready")}
        onError={() => setState("error")}
        className={`h-auto w-full rounded-web border-2 border-line bg-white ${state === "loading" ? "sr-only" : ""}`}
      />
    </>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 rounded-app border-2 border-line bg-paper px-4 py-10 text-center">
      <span aria-hidden className="h-8 w-8 animate-spin rounded-full border-4 border-line border-t-grass" />
      <span className="text-[15px] text-ink-muted">{label}…</span>
    </div>
  );
}

function Failed({ failure, retry, downloadHref }: { failure: Failure; retry: () => void; downloadHref: string }) {
  if (failure === "unreadable") {
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-app border-2 border-line bg-paper p-4">
        <span className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-orange-tint text-kit-orange">
            <FileWarning aria-hidden size={20} />
          </span>
          <span className="text-[17px] font-extrabold">This file can&apos;t be shown here</span>
        </span>
        <p className="text-[15px] leading-[22px]">Download it to open on your phone.</p>
        <a href={downloadHref} className="btn-chunky btn-grass self-start">
          <Download aria-hidden size={18} />
          Download
        </a>
      </div>
    );
  }
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-app border-2 border-line bg-paper p-4">
      <span className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-orange-tint text-kit-orange">
          <FileWarning aria-hidden size={20} />
        </span>
        <span className="text-[17px] font-extrabold">This file didn&apos;t open</span>
      </span>
      <p className="text-[15px] leading-[22px]">Check your signal and try again, or download it to open on your phone.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={retry} className="btn-chunky btn-grass">
          Try again
        </button>
        <a href={downloadHref} className="btn-chunky btn-paper">
          <Download aria-hidden size={18} />
          Download
        </a>
      </div>
    </div>
  );
}
