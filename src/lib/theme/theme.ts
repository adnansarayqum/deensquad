// Settings → Appearance (redesign brief, Oct 2026): follow the phone, or always Light or Dark, kept on this phone
// only (localStorage). The choice is applied as data-theme on <html> by THEME_SCRIPT before the first paint, and
// tokens.css lets data-theme win over the phone's setting (scripts/build-tokens.mjs).

export const THEME_KEY = "ds-theme";
export type ThemeChoice = "system" | "light" | "dark";

export const isThemeChoice = (v: unknown): v is ThemeChoice => v === "system" || v === "light" || v === "dark";

/** Runs in <head> while the page is parsed, so a dark choice never flashes light first. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

/** Applies and remembers a choice; "system" removes both. Storage that throws still applies it for this visit. */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Private browsing or blocked storage: the choice lasts until the page is closed.
  }
}

export function savedTheme(): ThemeChoice {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}
