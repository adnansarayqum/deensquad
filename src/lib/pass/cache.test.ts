import { describe, expect, it } from "vitest";
import { OFFLINE_IMAGE_MAX } from "../venue-pass/qr";
import { clearPassCache, PASS_CACHE_KEY, readHubCache, readPassCache, writePassCache, type CachedPass } from "./cache";

/** A plain in-memory Storage. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

const token = (n: number) => `DSP.30000000-0000-4000-8000-00000000000${n}.abcdefghijklmnopqrstuv`;
const yusuf: CachedPass = { token: token(1), firstName: "Yusuf", ageGroup: "U10" };
const musa: CachedPass = { token: token(2), firstName: "Musa", ageGroup: "U7" };

describe("the QR codes kept on the phone", () => {
  it("keeps only each child's QR text, first name and group, for one user", () => {
    const storage = memoryStorage();
    writePassCache(storage, "user-a", [{ ...yusuf, ...({ lastName: "Sample", id: "x" } as object) }, musa]);
    expect(JSON.parse(storage.getItem(PASS_CACHE_KEY)!)).toEqual({ v: 1, user: "user-a", passes: [yusuf, musa] });
    expect(readPassCache(storage)).toEqual([yusuf, musa]);
    expect(readPassCache(storage, "user-a")).toEqual([yusuf, musa]);
    expect(readPassCache(storage, "user-b")).toEqual([]);
  });

  it("is replaced when someone else signs in, and cleared when they have no children or sign out", () => {
    const storage = memoryStorage();
    writePassCache(storage, "user-a", [yusuf, musa]);
    writePassCache(storage, "user-b", [musa]);
    expect(readPassCache(storage)).toEqual([musa]);
    writePassCache(storage, "user-c", []);
    expect(storage.getItem(PASS_CACHE_KEY)).toBeNull();
    writePassCache(storage, "user-a", [yusuf]);
    clearPassCache(storage);
    expect(readPassCache(storage)).toEqual([]);
  });

  it("keeps a child in the Girls group, whose group has no number", () => {
    const storage = memoryStorage();
    const maryam: CachedPass = { token: token(3), firstName: "Maryam", ageGroup: "Girls" };
    writePassCache(storage, "user-a", [yusuf, maryam]);
    expect(readPassCache(storage)).toEqual([yusuf, maryam]);
  });

  it("ignores anything that isn't a pass, and damaged or missing storage", () => {
    const storage = memoryStorage();
    writePassCache(storage, "user-a", [yusuf, { token: "https://example.com", firstName: "X", ageGroup: "U10" }, { ...musa, ageGroup: "<b>" }]);
    expect(readPassCache(storage)).toEqual([yusuf]);
    storage.setItem(PASS_CACHE_KEY, "{not json");
    expect(readPassCache(storage)).toEqual([]);
    storage.setItem(PASS_CACHE_KEY, JSON.stringify({ v: 2, user: "user-a", passes: [yusuf] }));
    expect(readPassCache(storage)).toEqual([]);
    expect(readPassCache(null)).toEqual([]);
    expect(() => writePassCache(null, "user-a", [yusuf])).not.toThrow();
    const full = { ...memoryStorage(), setItem: () => { throw new Error("QuotaExceededError"); } } as Storage;
    expect(() => writePassCache(full, "user-a", [yusuf])).not.toThrow();
  });
});

describe("the parent's sports hub entry code kept with them", () => {
  const FILE = "30000000-0000-4000-8000-0000000000aa";
  const png = "data:image/png;base64,iVBORw0KGgo=";

  it("keeps its text, or a small screenshot with its file id, for the same user only", () => {
    const storage = memoryStorage();
    writePassCache(storage, "user-a", [yusuf], { text: "HUB-123" });
    expect(readHubCache(storage)).toEqual({ text: "HUB-123" });
    expect(readHubCache(storage, "user-b")).toBeNull();
    // The children's codes are kept exactly as before, and an older offline page reads them unchanged.
    expect(readPassCache(storage)).toEqual([yusuf]);
    writePassCache(storage, "user-a", [yusuf], { image: png, id: FILE });
    expect(readHubCache(storage)).toEqual({ image: png, id: FILE });
    writePassCache(storage, "user-a", [yusuf]);
    expect(readHubCache(storage)).toBeNull();
  });

  it("is kept for a parent with no child's code yet; nothing at all clears it", () => {
    const storage = memoryStorage();
    writePassCache(storage, "user-a", [], { text: "HUB-123" });
    expect(readHubCache(storage)).toEqual({ text: "HUB-123" });
    expect(readPassCache(storage)).toEqual([]);
    writePassCache(storage, "user-a", [], null);
    expect(storage.getItem(PASS_CACHE_KEY)).toBeNull();
  });

  it("refuses anything else: a remote or script address, a picture over the limit, extra fields, blank text", () => {
    const storage = memoryStorage();
    for (const hub of [
      { image: "https://evil.example/x.png", id: FILE },
      { image: "data:text/html;base64,PHNjcmlwdD4=", id: FILE },
      { image: `data:image/png;base64,${"A".repeat(OFFLINE_IMAGE_MAX)}`, id: FILE },
      { image: png, id: "not-an-id" },
      { text: "   " },
    ]) {
      writePassCache(storage, "user-a", [yusuf], hub as never);
      expect(readHubCache(storage)).toBeNull();
    }
    writePassCache(storage, "user-a", [yusuf], { text: "HUB-1", extra: "x" } as never);
    expect(JSON.parse(storage.getItem(PASS_CACHE_KEY)!).hub).toEqual({ text: "HUB-1" });
  });
});
