import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import { MAX_FILE_BYTES, sniff } from "../files";

// Fetching a product photo from a link an admin pasted (or a seeded one). The server reaches out to an address
// someone typed, so it only goes to public hosts over https: a link (or a redirect from one) naming a literal IP,
// or a host that resolves to the server's own network, loopback, link-local or private ranges, is refused.

export const FETCH_TIMEOUT_MS = 20_000;
export const MAX_REDIRECTS = 3;

/** Every address a host name resolves to. */
export type Resolve = (host: string) => Promise<string[]>;

const lookupAll: Resolve = async (host) => (await dns.lookup(host, { all: true, verbatim: true })).map((a) => a.address);

export type FetchImageOptions = { resolve?: Resolve; fetchFn?: typeof fetch };

export async function fetchImage(url: string, { resolve = lookupAll, fetchFn = fetch }: FetchImageOptions = {}): Promise<{ data: Uint8Array; mime: string } | null> {
  if (!/^https:\/\//.test(url)) return null;
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  let current = url;
  for (let hop = 0; ; hop++) {
    await assertPublicHost(current, resolve);
    const res = await fetchFn(current, { signal, redirect: "manual" });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      await res.body?.cancel().catch(() => {});
      if (hop >= MAX_REDIRECTS) throw new Error("too many redirects");
      const location = res.headers.get("location");
      if (!location) throw new Error("redirect without a location");
      const next = new URL(location, current);
      if (next.protocol !== "https:") throw new Error("redirect to a non-https address");
      current = next.href;
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const size = Number(res.headers.get("content-length") ?? 0);
    if (size > MAX_FILE_BYTES) throw new Error("too big");
    const data = new Uint8Array(await res.arrayBuffer());
    if (data.byteLength > MAX_FILE_BYTES) throw new Error("too big");
    const mime = sniff(data);
    if (!mime || mime === "application/pdf") throw new Error("not a photo");
    return { data, mime };
  }
}

/** Throws unless the URL's host is a name that resolves only to public addresses. */
export async function assertPublicHost(url: string, resolve: Resolve): Promise<void> {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  if (!host) throw new Error("no host");
  if (isIP(host)) throw new Error("links to an IP address aren't allowed");
  const addresses = await resolve(host);
  if (addresses.length === 0) throw new Error("host not found");
  if (addresses.some(isPrivateAddress)) throw new Error("host is on a private network");
}

/** Loopback, unspecified, private (10/8, 172.16/12, 192.168/16), link-local (169.254/16, fe80::/10), ULA (fc00::/7), or unparsable. */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPrivateV4(ip.split(".").map(Number));
  if (kind !== 6) return true;
  const h = hextets(ip);
  if (!h) return true;
  if (h.every((x) => x === 0)) return true; // ::
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return true; // ::1
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) return isPrivateV4([h[6] >> 8, h[6] & 0xff, h[7] >> 8, h[7] & 0xff]); // ::ffff:a.b.c.d
  if ((h[0] & 0xffc0) === 0xfe80) return true; // fe80::/10
  if ((h[0] & 0xfe00) === 0xfc00) return true; // fc00::/7
  return false;
}

function isPrivateV4([a, b]: number[]): boolean {
  return a === 0 || a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

/** The eight 16-bit groups of an IPv6 address, or null if it can't be read. */
function hextets(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/%.*$/, "");
  const v4 = s.match(/:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const o = v4[1].split(".").map(Number);
    s = `${s.slice(0, -v4[1].length)}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const parts = s.split("::");
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(":") : [];
  const tail = parts[1] ? parts[1].split(":") : [];
  const missing = parts.length === 2 ? 8 - head.length - tail.length : 0;
  if (missing < 0 || head.length + tail.length + missing !== 8) return null;
  const groups = [...head, ...Array<string>(missing).fill("0"), ...tail];
  const values = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return values.some(Number.isNaN) ? null : values;
}
