import "server-only";

import { sentryServerDsn } from "./config";
import type { MonitoringUser } from "./scrub";

/** Tags this request's error reports with the signed-in person (id and parent/coach/admin only). No-op unless Sentry is on. */
export function noteServerUser(user: MonitoringUser | null) {
  if (!user || !sentryServerDsn()) return;
  import("./sentry-server").then((m) => m.setServerUser(user)).catch(() => {});
}
