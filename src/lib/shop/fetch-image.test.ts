import { describe, expect, it } from "vitest";
import { MAX_REDIRECTS, assertPublicHost, fetchImage, isPrivateAddress, type Resolve } from "./fetch-image";

// A 1x1 PNG: enough for sniff() to call it a photo.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);

const hosts: Record<string, string[]> = {
  "cdn.example.com": ["93.184.216.34"],
  "v6.example.com": ["2606:2800:220:1:248:1893:25c8:1946"],
  "inside.example.com": ["10.0.0.5"],
  "mixed.example.com": ["93.184.216.34", "192.168.1.9"],
  "loop.example.com": ["::1"],
  "mapped.example.com": ["::ffff:127.0.0.1"],
  "link.example.com": ["fe80::1"],
  "ula.example.com": ["fd12::1"],
  "metadata.example.com": ["169.254.169.254"],
  "gone.example.com": [],
};
const resolve: Resolve = async (host) => {
  if (!(host in hosts)) throw new Error(`ENOTFOUND ${host}`);
  return hosts[host];
};

/** A fake server: each entry answers one URL. */
function server(routes: Record<string, { status?: number; headers?: Record<string, string>; body?: Uint8Array }>) {
  const calls: string[] = [];
  const fetchFn = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const r = routes[url];
    if (!r) return new Response("not found", { status: 404 });
    return new Response(r.body ? new Uint8Array(r.body) : null, { status: r.status ?? 200, headers: r.headers });
  }) as typeof fetch;
  return { fetchFn, calls };
}

describe("isPrivateAddress", () => {
  it("knows loopback, private, link-local, unique local and mapped addresses", () => {
    for (const ip of ["127.0.0.1", "127.9.9.9", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.0.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "100.127.255.254"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["::1", "::", "fe80::1", "febf::1", "fc00::1", "fd12:3456::1", "::ffff:10.0.0.1", "::ffff:7f00:1", "fe80::1%eth0"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "172.15.0.1", "100.63.255.255", "100.128.0.1", "2606:2800:220:1:248:1893:25c8:1946", "2001:db8::1", "::ffff:93.184.216.34"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
    expect(isPrivateAddress("not an ip")).toBe(true);
  });
});

describe("assertPublicHost", () => {
  it("allows public names and refuses literal IPs, private, loopback, link-local and unique local hosts", async () => {
    await expect(assertPublicHost("https://cdn.example.com/a.png", resolve)).resolves.toBeUndefined();
    await expect(assertPublicHost("https://v6.example.com/a.png", resolve)).resolves.toBeUndefined();
    for (const url of ["https://10.0.0.1/a.png", "https://127.0.0.1/a.png", "https://[::1]/a.png", "https://93.184.216.34/a.png"]) {
      await expect(assertPublicHost(url, resolve), url).rejects.toThrow("links to an IP address aren't allowed");
    }
    for (const host of ["inside", "mixed", "loop", "mapped", "link", "ula", "metadata"]) {
      await expect(assertPublicHost(`https://${host}.example.com/a.png`, resolve), host).rejects.toThrow("host is on a private network");
    }
    await expect(assertPublicHost("https://gone.example.com/a.png", resolve)).rejects.toThrow("host not found");
    await expect(assertPublicHost("https://nowhere.example.com/a.png", resolve)).rejects.toThrow("ENOTFOUND");
  });
});

describe("fetchImage", () => {
  it("fetches a photo from a public https host", async () => {
    const { fetchFn, calls } = server({ "https://cdn.example.com/a.png": { body: PNG } });
    const image = await fetchImage("https://cdn.example.com/a.png", { resolve, fetchFn });
    expect(image).toMatchObject({ mime: "image/png" });
    expect(calls).toEqual(["https://cdn.example.com/a.png"]);
    expect(await fetchImage("http://cdn.example.com/a.png", { resolve, fetchFn })).toBeNull();
  });

  it("follows up to three https redirects, checking each host, and refuses the rest", async () => {
    const { fetchFn, calls } = server({
      "https://cdn.example.com/1": { status: 302, headers: { location: "/2" } },
      "https://cdn.example.com/2": { status: 301, headers: { location: "https://v6.example.com/3" } },
      "https://v6.example.com/3": { status: 307, headers: { location: "https://cdn.example.com/a.png" } },
      "https://cdn.example.com/a.png": { body: PNG },
      "https://cdn.example.com/loop": { status: 302, headers: { location: "/loop" } },
      "https://cdn.example.com/plain": { status: 302, headers: { location: "http://cdn.example.com/a.png" } },
      "https://cdn.example.com/inside": { status: 302, headers: { location: "https://inside.example.com/a.png" } },
      "https://cdn.example.com/ip": { status: 302, headers: { location: "https://169.254.169.254/latest/meta-data" } },
      "https://cdn.example.com/nowhere": { status: 302 },
    });
    expect(await fetchImage("https://cdn.example.com/1", { resolve, fetchFn })).toMatchObject({ mime: "image/png" });
    expect(calls).toEqual(["https://cdn.example.com/1", "https://cdn.example.com/2", "https://v6.example.com/3", "https://cdn.example.com/a.png"]);

    calls.length = 0;
    await expect(fetchImage("https://cdn.example.com/loop", { resolve, fetchFn })).rejects.toThrow("too many redirects");
    expect(calls).toHaveLength(MAX_REDIRECTS + 1);
    await expect(fetchImage("https://cdn.example.com/plain", { resolve, fetchFn })).rejects.toThrow("non-https");
    await expect(fetchImage("https://cdn.example.com/inside", { resolve, fetchFn })).rejects.toThrow("private network");
    await expect(fetchImage("https://cdn.example.com/ip", { resolve, fetchFn })).rejects.toThrow("IP address");
    await expect(fetchImage("https://cdn.example.com/nowhere", { resolve, fetchFn })).rejects.toThrow("without a location");
    // The refused targets were never fetched.
    expect(calls.some((c) => c.includes("inside.example.com") || c.includes("169.254") || c.startsWith("http://"))).toBe(false);
  });

  it("refuses a private host before any request goes out, and a reply that isn't a photo", async () => {
    const { fetchFn, calls } = server({ "https://inside.example.com/a.png": { body: PNG }, "https://cdn.example.com/page": { body: new TextEncoder().encode("<html>") } });
    await expect(fetchImage("https://inside.example.com/a.png", { resolve, fetchFn })).rejects.toThrow("private network");
    expect(calls).toEqual([]);
    await expect(fetchImage("https://cdn.example.com/page", { resolve, fetchFn })).rejects.toThrow("not a photo");
    await expect(fetchImage("https://cdn.example.com/missing", { resolve, fetchFn })).rejects.toThrow("HTTP 404");
  });
});
