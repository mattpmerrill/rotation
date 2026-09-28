import { afterEach, describe, expect, it, vi } from "vitest";
import { logEvent } from "./log";

afterEach(() => vi.restoreAllMocks());

describe("logEvent", () => {
  it("writes one JSON line with the level, the event, a timestamp and the fields", () => {
    const out = vi.spyOn(console, "log").mockImplementation(() => {});
    logEvent("warn", "trade.rejected", { sqlstate: "23514" });
    expect(out).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(out.mock.calls[0]?.[0]));
    expect(line).toMatchObject({ level: "warn", event: "trade.rejected", sqlstate: "23514" });
    expect(Number.isNaN(Date.parse(line.time))).toBe(false);
  });

  it("sends errors to stderr and everything else to stdout", () => {
    const out = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    logEvent("error", "boom");
    logEvent("info", "fine");
    expect(err).toHaveBeenCalledTimes(1);
    expect(out).toHaveBeenCalledTimes(1);
  });
});
