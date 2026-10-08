/**
 * A server action whose body Next couldn't decode (empty, or not the JSON the client sends): someone poking at the
 * site, or a request cut short, never a fault in the app. Next answers 500 and logs it itself before any of the app's
 * code runs, so the most the app can do is not email or report it.
 */
export function isMalformedActionBody(error: { name?: string; message?: string }, routeType: string | undefined): boolean {
  if (routeType !== "action") return false;
  return error.name === "SyntaxError" && /JSON/i.test(error.message ?? "");
}
