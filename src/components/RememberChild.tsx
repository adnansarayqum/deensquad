"use client";

import { useEffect } from "react";
import { CHILD_COOKIE } from "@/lib/parent/child-cookie";

/**
 * Family remembers the child it last showed (UX review, Oct 2026: leaving Family and coming back showed the first
 * child again, so a parent of two read the wrong child's page). A session cookie holding a child id only:
 * the server uses it only when it's one of the signed-in family's children, so on a shared phone it's ignored.
 */
export function RememberChild({ id }: { id: string }) {
  useEffect(() => {
    try {
      document.cookie = `${CHILD_COOKIE}=${id}; path=/player; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
    } catch {
      // Cookies blocked: Family opens on the first child, as before.
    }
  }, [id]);
  return null;
}
