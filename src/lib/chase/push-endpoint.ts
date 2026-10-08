// Which push subscription endpoints the app will save (and later send to). A browser's endpoint is always on its
// push service, so anything else (another host, plain http, a port, a user name) is refused: the server would
// otherwise post to whatever address a signed-in person handed it.

const EXACT = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com"]);
// Apple (web.push.apple.com, …), Windows (wns2-….notify.windows.com) and Mozilla's other hosts.
const SUFFIXES = [".push.apple.com", ".notify.windows.com", ".push.services.mozilla.com"];

export function isPushEndpoint(endpoint: unknown): boolean {
  if (typeof endpoint !== "string" || endpoint.length >= 1000) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") return false;
  const host = url.hostname.toLowerCase();
  return EXACT.has(host) || SUFFIXES.some((s) => host.endsWith(s) && host.length > s.length);
}
