import { describe, expect, it } from "vitest";
import { clearPassCache, PASS_CACHE_KEY, readPassCache, writePassCache, type CachedPass } from "./cache";

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
