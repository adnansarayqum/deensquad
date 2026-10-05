// Small helpers for the in-app file viewer (/files/[id]) and the file route behind it.

/**
 * Where the viewer's Back control goes when there's no history to go back through: the screen the
 * file was opened from, if that's a path inside this app, otherwise the fallback for the person.
 * Anything that could leave the app ("//evil.example", "https://…", "/\evil") falls back.
 */
export function backPath(from: unknown, fallback: string): string {
  if (typeof from !== "string" || from.length > 200) return fallback;
  if (!/^\/[A-Za-z0-9]/.test(from) || /[\\\s]/.test(from)) return fallback;
  if (from.startsWith("/files/") || from.startsWith("/api/")) return fallback;
  return from;
}

/** The viewer link for a file, remembering which screen opened it. */
export function viewerHref(fileId: string, from?: string): string {
  return from ? `/files/${fileId}?from=${encodeURIComponent(from)}` : `/files/${fileId}`;
}

/** Content-Disposition for a stored file: shown in place, or saved when `download` is set. */
export function contentDisposition(name: string, download: boolean): string {
  // Upload names are already limited to letters, digits, dots, dashes and spaces; this keeps the header safe regardless.
  const safe = name.replace(/[^\w.\- ]+/g, "").slice(0, 100).trim() || "attachment";
  return `${download ? "attachment" : "inline"}; filename="${safe}"`;
}

export function pageCount(n: number): string {
  return n === 1 ? "1 page" : `${n} pages`;
}

/**
 * The scale to draw a PDF page at so it fills `cssWidth` sharply on this screen, kept under the
 * canvas size phones allow (iOS refuses canvases much over 16 million pixels).
 */
export function renderScale(pageWidth: number, pageHeight: number, cssWidth: number, devicePixelRatio: number, maxPixels = 12_000_000): number {
  const dpr = Math.min(Math.max(devicePixelRatio || 1, 1), 2);
  let scale = (cssWidth * dpr) / pageWidth;
  const pixels = pageWidth * scale * pageHeight * scale;
  if (pixels > maxPixels) scale *= Math.sqrt(maxPixels / pixels);
  return scale;
}
