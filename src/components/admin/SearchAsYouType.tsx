"use client";

import { useEffect } from "react";

/**
 * Sends a plain GET search form a moment after typing stops, so the list filters as you type. The form and its
 * Find button still work without JavaScript. `inputId` is the search box.
 */
export function SearchAsYouType({ inputId }: { inputId: string }) {
  useEffect(() => {
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    if (!input?.form) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onInput = () => {
      clearTimeout(timer);
      timer = setTimeout(() => input.form?.requestSubmit(), 400);
    };
    input.addEventListener("input", onInput);
    return () => {
      clearTimeout(timer);
      input.removeEventListener("input", onInput);
    };
  }, [inputId]);
  return null;
}
