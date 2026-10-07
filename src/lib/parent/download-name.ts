/** The file name in a Content-Disposition header ("attachment; filename=\"x.json\""), else a plain default. */
export function downloadName(disposition: string | null, fallback = "deen-squad-my-data.json"): string {
  const match = disposition?.match(/filename="([^"/\\]+)"/);
  return match ? match[1] : fallback;
}
