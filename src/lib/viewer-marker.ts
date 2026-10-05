// The in-app file viewer's "opened from a screen in the app" marker. An attachment link sets it on tap;
// the viewer reads and clears it, and only then does Back step back through history. Opened any other
// way (a fresh tab, a pasted link, a reload), Back goes to the `from` screen instead. Storage can be
// unavailable (private browsing), in which case Back always goes to `from`.

const KEY = "ds-viewer-opened";

export function markViewerOpened(href: string): void {
  try {
    sessionStorage.setItem(KEY, href);
  } catch {
    // No storage: Back falls back to the `from` screen.
  }
}

/** True if the viewer at `here` (path + query) was opened by a tap in the app. Clears the marker either way. */
export function takeViewerOpened(here: string): boolean {
  try {
    const marked = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return marked === here;
  } catch {
    return false;
  }
}
