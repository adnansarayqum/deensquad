// The visitor's internet address, for the sign-in rate limits. Railway's edge sets X-Real-IP to the address
// it saw (docs.railway.com/networking/public-networking/specs-and-limits). X-Forwarded-For is a fallback:
// its leftmost entries are whatever the visitor sent, so only the rightmost one (added by the nearest proxy) is used.

const MAX_LENGTH = 64;

function clean(value: string | null | undefined): string | null {
  const ip = value?.trim().slice(0, MAX_LENGTH);
  return ip || null;
}

export function clientIpFrom(h: { get(name: string): string | null }): string | null {
  return clean(h.get("x-real-ip")) ?? clean(h.get("x-forwarded-for")?.split(",").at(-1));
}
