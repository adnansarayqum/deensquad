import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../db", async (importActual) => ({ isDemo: (await importActual<typeof import("../db")>()).isDemo }));

// Which runs may sign QR codes without QR_SECRET: development and the demo only, never a real database in production.
describe("passToken without QR_SECRET", () => {
  afterEach(() => vi.unstubAllEnvs());

  const token = async () => {
    vi.resetModules();
    const { passToken } = await import("./token");
    return passToken("20000000-0000-4000-8000-000000000001");
  };

  it("refuses in production with a real database, even with DEMO_MODE set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("QR_SECRET", "");
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("DATABASE_URL", "postgres://app:pw@db.railway.internal:5432/railway");
    await expect(token()).rejects.toThrow("QR_SECRET is not set.");
  });

  it("signs with the stand-in secret in the demo (DEMO_MODE with an in-memory database) and outside production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("QR_SECRET", "");
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("DATABASE_URL", "pglite://memory");
    expect(await token()).toMatch(/^DSP\.20000000-0000-4000-8000-000000000001\.[A-Za-z0-9_-]{22}$/);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEMO_MODE", "");
    vi.stubEnv("DATABASE_URL", "postgres://x");
    expect(await token()).toMatch(/^DSP\./);
  });
});
