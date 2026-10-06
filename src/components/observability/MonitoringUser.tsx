"use client";

import { useEffect } from "react";
import { setMonitoringUser } from "@/lib/observability/report";
import type { MonitoringUser as User } from "@/lib/observability/scrub";

/** Tags this browser's error reports with the signed-in person (opaque id and parent/coach/admin only). Renders nothing. */
export function MonitoringUser({ user }: { user: User | null }) {
  const id = user?.id ?? null;
  const segment = user?.segment ?? null;
  useEffect(() => {
    setMonitoringUser(id && segment ? { id, segment } : null);
  }, [id, segment]);
  return null;
}
