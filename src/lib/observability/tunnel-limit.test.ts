import { beforeEach, describe, expect, it } from "vitest";
import { TUNNEL_LIMIT, TUNNEL_WINDOW_MS, allowTunnel, resetTunnelLimit } from "./tunnel-limit";

describe("error-report tunnel limit", () => {
  beforeEach(() => resetTunnelLimit());

  it("lets 60 reports a minute through per address, then refuses until the minute is up", () => {
    const t = 1_000_000;
    for (let i = 0; i < TUNNEL_LIMIT; i++) expect(allowTunnel("203.0.113.1", t + i)).toBe(true);
    expect(allowTunnel("203.0.113.1", t + 100)).toBe(false);
    // another visitor is unaffected
    expect(allowTunnel("203.0.113.2", t + 100)).toBe(true);
    // a new minute starts afresh
    expect(allowTunnel("203.0.113.1", t + TUNNEL_WINDOW_MS)).toBe(true);
  });

  it("counts visitors with no address together", () => {
    for (let i = 0; i < TUNNEL_LIMIT; i++) allowTunnel(null, 0);
    expect(allowTunnel(null, 1)).toBe(false);
  });
});
