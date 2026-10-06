// Small input cleaners shared by forms and the CSV import.

/** Trimmed text with inner whitespace collapsed, or null if empty. Cut to `max` characters. */
export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

/** Multi-line text (news posts): trims each end, keeps paragraphs, at most `max` characters. */
export function cleanBody(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return text ? text.slice(0, max) : null;
}

/**
 * A phone number tidied for display. UK numbers come out one way, "07700 900123", however they were written
 * ("+44 7700 900123", "+44 (0)7700 900123", "447700900123"); other countries' keep their code: "+33612345678".
 * Null if it isn't one.
 */
export function cleanPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  const digits = raw.replace(/\D/g, "");
  const uk = (national: string) => `0${national.slice(0, 4)} ${national.slice(4)}`;
  // +44 with or without the "(0)", or 44 with no plus: the UK number with its leading 0 back.
  const intl = digits.match(/^440?(\d{10})$/);
  if (intl && (raw.startsWith("+") || raw.startsWith("44"))) return uk(intl[1]);
  if (raw.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (/^0044\d{10}$/.test(digits)) return uk(digits.slice(4));
  if (/^0\d{10}$/.test(digits)) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  // A UK mobile whose leading 0 was dropped (Excel stores 07700900123 as the number 7700900123).
  if (/^7\d{9}$/.test(digits)) return uk(digits);
  return null;
}

/** Digits only with a 44 country code, for WhatsApp and tel: links. */
export function dialable(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0") ? `44${digits.slice(1)}` : digits;
}
