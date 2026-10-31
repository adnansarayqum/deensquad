"use client";

import { useState, useSyncExternalStore } from "react";
import { applyTheme, savedTheme, type ThemeChoice } from "@/lib/theme/theme";

const noSubscribe = () => () => {};
const CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "Same as my phone" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** Settings → Appearance: three radio cards. Needs JavaScript (it's kept on this phone, not the account). */
export function AppearanceChoice() {
  const live = useSyncExternalStore(noSubscribe, () => true, () => false);
  const stored = useSyncExternalStore(noSubscribe, savedTheme, () => "system" as ThemeChoice);
  const [picked, setPicked] = useState<ThemeChoice | null>(null);
  const choice = picked ?? stored;
  if (!live) return <p className="text-[15px] text-ink-muted">The app follows your phone&apos;s light or dark setting.</p>;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="sr-only">Appearance</legend>
      {CHOICES.map((c) => (
        <label key={c.value} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-app bg-paper shadow-card px-3.5 text-[16px] font-bold has-[:checked]:border-grass has-[:checked]:bg-grass-tint">
          <input
            type="radio"
            name="appearance"
            value={c.value}
            checked={choice === c.value}
            onChange={() => {
              setPicked(c.value);
              applyTheme(c.value);
            }}
            className="h-5 w-5 shrink-0 accent-[var(--grass)]"
          />
          {c.label}
        </label>
      ))}
      <p className="text-[15px] text-ink-muted">Kept on this phone only.</p>
    </fieldset>
  );
}
