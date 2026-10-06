// Addresses as they may leave the app (to Sentry or the analytics tool): no query string or fragment
// (`?child=`, `?from=`, `?need=`, sign-in tokens), and no ids in the path, so `/admin/families/<uuid>`
// becomes `/admin/families/:id`. Pure functions, shared by the server and the browser.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_DIGITS = /^\d{5,}$/;
const LONG_HEX = /^[0-9a-f]{16,}$/i;
/** A random token (base64url and the like): long, and mixes letters with digits or symbols. */
const TOKEN = /^(?=.*[0-9_-])(?=.*[A-Za-z])[A-Za-z0-9_-]{20,}$/;
/** The sign-in screens. Anything else under /sign-in/ is treated as a token. */
const SIGN_IN_PAGES = new Set(["code", "link", "not-linked"]);

function isId(segment: string): boolean {
  return UUID.test(segment) || LONG_DIGITS.test(segment) || LONG_HEX.test(segment) || TOKEN.test(segment);
}

/** `/admin/families/<uuid>` → `/admin/families/:id`; `/sign-in/<token>` → `/sign-in/:id`. No query, no fragment. */
export function normalisePath(path: string): string {
  const bare = path.split(/[?#]/, 1)[0] || "/";
  const parts = bare.split("/");
  const signIn = parts[1] === "sign-in";
  return parts
    .map((segment, i) => {
      if (!segment) return segment;
      let decoded = segment;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        // keep it as it is
      }
      if (isId(decoded)) return ":id";
      if (signIn && i >= 2 && !(i === 2 && SIGN_IN_PAGES.has(decoded))) return ":id";
      return segment;
    })
    .join("/");
}

/** Origin plus normalised path, for absolute addresses; a relative address keeps only its normalised path. */
export function normaliseUrl(href: string): string {
  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return `${url.protocol}//${url.host}${normalisePath(url.pathname)}`;
    return `${url.origin}${normalisePath(url.pathname)}`;
  } catch {
    return normalisePath(href);
  }
}

/** Pages the analytics tool counts: everything but the API. */
export function isTrackedPath(path: string): boolean {
  return !(path === "/api" || path.startsWith("/api/"));
}
