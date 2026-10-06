/**
 * The visitor left before the page finished loading (closed the app, switched screens or lost signal),
 * so the server couldn't finish sending it. Nothing failed on our side; not worth an email or an error report.
 * Lives apart from alerts.ts (server only) so the Sentry filters in the browser can use it too.
 */
export function isClientDisconnect(message: string): boolean {
  return /destination stream closed early|^aborted$|ECONNRESET|socket hang up/i.test(message);
}
