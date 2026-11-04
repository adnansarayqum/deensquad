// Code guards for the security checklist (4 Nov 2026): keys on the server, admin behind login, every record checked
// against who's asking, limits on sign-up, webhooks verified. Each reads the source, so a new route, action, page or
// secret added later without the check fails here. The database side (RLS, owner checks) is db/security.test.ts.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { LIMITS } from "./auth/service";

const ROOT = join(__dirname, "..", "..");
const SRC = join(ROOT, "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
const files = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));
const read = (f: string) => readFileSync(f, "utf8");
const rel = (f: string) => relative(ROOT, f);
const isClient = (s: string) => /^\s*["']use client["']/.test(s);
const isServerActions = (s: string) => /^\s*["']use server["']/.test(s);

/** A sign-in check: the session helpers in src/lib/auth/session.ts. */
const SIGNED_IN = /require(Parent|Staff|Admin|User)\(|getCurrentUser\(/;

describe("keys stay on the server", () => {
  /** Variables that hold a secret: any of these in browser code would ship it to every phone. */
  const SECRET = /(SECRET|_KEY|TOKEN|PASSWORD|DATABASE_URL|PRIVATE)/;

  it("browser code reads no server variable", () => {
    const leaks = files.flatMap((f) => {
      const s = read(f);
      if (!isClient(s)) return [];
      const names = [...s.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]);
      return names.filter((n) => !n.startsWith("NEXT_PUBLIC_") && n !== "NODE_ENV").map((n) => `${rel(f)}: ${n}`);
    });
    expect(leaks).toEqual([]);
  });

  it("no NEXT_PUBLIC_ variable (built into the browser bundle) is a secret", () => {
    const names = new Set(files.flatMap((f) => [...read(f).matchAll(/process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g)].map((m) => m[1])));
    // A Sentry DSN is public by design (it can only send reports); site IDs are public too.
    expect([...names].filter((n) => SECRET.test(n))).toEqual([]);
  });

  it("every library file that reads a secret is server-only, so importing it into a client component fails the build", () => {
    const loose = files.filter((f) => {
      if (!f.includes(`${join("src", "lib")}`)) return false; // pages and routes are server code already
      const s = read(f);
      const names = [...s.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]);
      return names.some((n) => SECRET.test(n) && !n.startsWith("NEXT_PUBLIC_")) && !s.includes(`"server-only"`) && !isServerActions(s);
    });
    expect(loose.map(rel)).toEqual([]);
  });
});

describe("admin and staff screens are behind a login", () => {
  const pages = (area: string) => walk(join(SRC, "app", area)).filter((f) => /\/(page|layout)\.tsx$/.test(f));

  it("the staff layouts check the person is staff", () => {
    for (const area of ["admin", "coach"]) expect(read(join(SRC, "app", area, "layout.tsx"))).toMatch(/requireStaff\(/);
  });

  it("every admin and coach page checks again itself (a layout alone can be skipped by a client navigation)", () => {
    const bare = [...pages("admin"), ...pages("coach")].filter((f) => {
      if (f.endsWith("layout.tsx")) return false;
      const s = read(f);
      if (SIGNED_IN.test(s)) return false;
      // A page that only renders a shared component: that component must do the check.
      const imported = [...s.matchAll(/from "@\/components\/([\w/]+)"/g)].map((m) => join(SRC, "components", `${m[1]}.tsx`));
      return !imported.some((c) => {
        try {
          return SIGNED_IN.test(read(c));
        } catch {
          return false;
        }
      });
    });
    expect(bare.map(rel)).toEqual([]);
  });

  it("admin-only screens ask for an admin, not just staff", () => {
    const ADMIN_ONLY = [
      "admin/assistant",
      "admin/families/import",
      "admin/families/invite",
      "admin/families/teamfeepay",
      "admin/shop",
      "admin/staff",
      "admin/summary",
      "admin/wellbeing",
      "coach/awards/rewards",
    ];
    const loose = ADMIN_ONLY.flatMap((dir) => walk(join(SRC, "app", dir)).filter((f) => f.endsWith("page.tsx")))
      .filter((f) => !/requireAdmin\(/.test(read(f)))
      .map(rel);
    expect(loose).toEqual([]);
  });

  it("the proxy sends anyone without a session to sign-in, except the few public addresses", () => {
    const proxy = read(join(SRC, "proxy.ts"));
    const list = proxy.match(/const PUBLIC = \[(.*)\];/)?.[1] ?? "";
    expect(list.split(", ").sort()).toEqual(
      [
        "/^\\/api\\/calendar\\/[^/]+$/", // calendar apps send no cookie; the unguessable link is the key
        "/^\\/api\\/cron\\//", // bearer CRON_SECRET, checked in the route
        "/^\\/api\\/health$/",
        "/^\\/api\\/sumup\\//", // the webhook, which trusts nothing in its body
        "/^\\/privacy$/",
        "/^\\/sign-in(\\/|$)/",
        "/^\\/sign-up$/",
        "/^\\/trial$/",
      ].sort(),
    );
  });
});

describe("every request checks who is asking", () => {
  /** Routes that are meant to be reached without a session, and what guards them instead. */
  const PUBLIC_ROUTES: Record<string, RegExp> = {
    "src/app/api/health/route.ts": /select 1/, // no data, only that the app and database are up
    "src/app/api/cron/chase/route.ts": /timingSafeEqual/, // the cron's bearer secret
    "src/app/api/sumup/webhook/route.ts": /confirmSumupPayment/, // asks SumUp itself
    "src/app/api/calendar/[file]/route.ts": /guardianForToken|tokenHash|sha256|createHash/i, // the hashed link
    "src/app/monitoring/route.ts": /.*/, // Sentry tunnel: forwards only to the built-in DSN (its own tests)
  };

  it("every API route checks the session, or is a known public one with its own guard", () => {
    const routes = walk(join(SRC, "app")).filter((f) => f.endsWith("route.ts"));
    const bad = routes.filter((f) => {
      const s = read(f);
      const guard = PUBLIC_ROUTES[rel(f)];
      return guard ? !guard.test(s) : !SIGNED_IN.test(s);
    });
    expect(bad.map(rel)).toEqual([]);
  });

  it("every server action checks the session first, except signing in, signing up and booking a trial", () => {
    const PUBLIC_ACTIONS = new Set([
      "src/lib/auth/actions.ts:requestCode",
      "src/lib/auth/actions.ts:register",
      "src/lib/auth/actions.ts:submitCode",
      "src/lib/auth/actions.ts:submitLink",
      "src/lib/auth/actions.ts:signOut",
      "src/lib/auth/demo.ts:demoSignIn", // refuses outside the demo (isDemo)
      "src/lib/trials/actions.ts:bookTrialAction", // rate-limited per address and club-wide
    ]);
    const bare: string[] = [];
    for (const f of files) {
      const s = read(f);
      if (!isServerActions(s)) continue;
      const exports = [...s.matchAll(/export async function (\w+)\s*\(/g)];
      exports.forEach((m, i) => {
        const body = s.slice(m.index, exports[i + 1]?.index ?? s.length);
        const name = `${rel(f)}:${m[1]}`;
        if (!SIGNED_IN.test(body) && !PUBLIC_ACTIONS.has(name)) bare.push(name);
      });
    }
    expect(bare).toEqual([]);
    expect(read(join(SRC, "lib", "auth", "demo.ts"))).toMatch(/if \(!isDemo\(\)\) redirect/);
  });

  it("system access (no row level security) is never given an id straight from the request", () => {
    // asSystem bypasses RLS. In actions it may only run on ids the person was first checked against with asUser
    // (or on staff-wide lookups such as the admins' email addresses). A form value going straight into asSystem
    // would let anyone act on any record.
    const risky = files.flatMap((f) => {
      const s = read(f);
      if (!isServerActions(s)) return [];
      return [...s.matchAll(/asSystem\([^)]*formData\.get/g)].map(() => rel(f));
    });
    expect(risky).toEqual([]);
  });
});

describe("limits on sign-up", () => {
  it("sign-in codes and sign-ups are capped per email, per address and club-wide", () => {
    expect(LIMITS.perEmailPerHour).toBeGreaterThan(0);
    expect(LIMITS.perEmailPerHour).toBeLessThanOrEqual(10);
    expect(LIMITS.perIpPerHour).toBeLessThanOrEqual(1000);
    expect(LIMITS.signUpsPerHour).toBeLessThanOrEqual(500);
    const service = read(join(SRC, "lib", "auth", "service.ts"));
    for (const limit of ["perEmailPerHour", "perIpPerHour", "signUpsPerHour"]) expect(service).toContain(`LIMITS.${limit}`);
  });

  it("the public trial form is capped per address and club-wide, and has a honeypot", () => {
    const trial = read(join(SRC, "lib", "trials", "actions.ts"));
    expect(trial).toMatch(/windowCounter\(/);
    expect(trial).toMatch(/website/);
  });
});

describe("webhooks verified", () => {
  it("the SumUp webhook trusts nothing in its body: it asks SumUp, and matches the order's reference and amount", () => {
    const route = read(join(SRC, "app", "api", "sumup", "webhook", "route.ts"));
    expect(route).toMatch(/confirmSumupPayment\(/);
    expect(route).not.toMatch(/status = 'paid'|update shop_orders/); // never marks paid from the body
    expect(route).toMatch(/MAX_BODY_BYTES/);
    expect(route).toMatch(/perAddress\.hit/);
    const payments = read(join(SRC, "lib", "shop", "payments.ts"));
    expect(payments).toMatch(/getCheckout\(checkoutId\)/);
    expect(payments).toMatch(/checkout\.status !== "PAID"/);
    expect(payments).toMatch(/total_pence = \$3/);
  });

  it("the hourly cron checks its secret in constant time", () => {
    const cron = read(join(SRC, "app", "api", "cron", "chase", "route.ts"));
    expect(cron).toMatch(/timingSafeEqual/);
    expect(cron).toMatch(/if \(!secret/);
  });
});
