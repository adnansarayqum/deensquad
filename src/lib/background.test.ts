import { beforeEach, describe, expect, it, vi } from "vitest";
import { enqueue } from "./background";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("enqueue", () => {
  it("runs tasks one at a time, in order", async () => {
    const events: string[] = [];
    const task = (name: string, ms: number) => async () => {
      events.push(`${name} start`);
      await sleep(ms);
      events.push(`${name} end`);
    };
    await Promise.all([enqueue("first", task("first", 60)), enqueue("second", task("second", 10))]);
    expect(events).toEqual(["first start", "first end", "second start", "second end"]);
  });

  it("logs a failed task, never rejects, and still runs the next one", async () => {
    const next = vi.fn(async () => {});
    const failed = enqueue("plan notifications", async () => {
      throw new Error("push service down");
    });
    const after = enqueue("chase on post", next);
    await expect(failed).resolves.toBeUndefined();
    await expect(after).resolves.toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith("[background] plan notifications failed:", "push service down");
  });

  it("logs a task that throws before returning a promise", async () => {
    const failed = enqueue("sync", () => {
      throw new Error("boom");
    });
    await expect(failed).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("[background] sync failed:", "boom");
  });
});
