import { describe, expect, it } from "vitest";
import nextConfig, { withSentry } from "../next.config";

// Sentry's build step must keep every setting of the app's own (security headers, database drivers, upload size).
describe("next.config with Sentry", () => {
  it("is the plain config when no DSN is set for the build", () => {
    expect(process.env.SENTRY_DSN).toBeUndefined();
    expect(nextConfig).not.toHaveProperty("rewrites");
  });

  it("keeps the app's settings and adds no rewrite tunnel (the app has its own /monitoring route)", async () => {
    const wrapped = withSentry(nextConfig);
    expect(wrapped.poweredByHeader).toBe(false);
    expect(wrapped.experimental?.serverActions?.bodySizeLimit).toBe("9mb");
    expect(wrapped.serverExternalPackages).toEqual(expect.arrayContaining(["postgres", "@electric-sql/pglite"]));
    expect(await wrapped.headers!()).toEqual(await nextConfig.headers!());
    expect(wrapped.productionBrowserSourceMaps).toBeFalsy();
    const rewrites = wrapped.rewrites ? await (wrapped.rewrites as () => Promise<unknown>)() : [];
    expect(JSON.stringify(rewrites)).not.toMatch(/monitoring|sentry/);
  });
});
