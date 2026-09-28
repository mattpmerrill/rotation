import { afterEach, describe, expect, it, vi } from "vitest";
import { dbFailure } from "./failure";

afterEach(() => vi.restoreAllMocks());

function run(code: string | undefined, message = 'relation "entry_trades" violates something') {
  const out = vi.spyOn(console, "log").mockImplementation(() => {});
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  const result = dbFailure("trade.add", { code, message });
  return { result, out, err };
}

describe("dbFailure", () => {
  it.each([
    ["42501", "forbidden"],
    ["23514", "rule_violation"],
    ["23505", "conflict"],
    ["P0002", "not_found"],
  ])("maps SQLSTATE %s to the stable code %s and logs it as a warning", (sqlstate, code) => {
    const { result, out, err } = run(sqlstate);
    expect(!result.ok && result.error.code).toBe(code);
    expect(out).toHaveBeenCalledTimes(1);
    expect(err).not.toHaveBeenCalled();
  });

  it.each(["XX000", "PGRST301", undefined])(
    "treats %s as unexpected, logs it as an error, and shows a generic message",
    (code) => {
      const { result, err } = run(code);
      expect(!result.ok && result.error.code).toBe("unexpected");
      expect(err).toHaveBeenCalledTimes(1);
    },
  );

  it("never puts database text in the message a user sees, but keeps it in the log", () => {
    const secret = 'duplicate key value violates unique constraint "entry_trades_pkey"';
    const { result, out } = run("23505", secret);
    expect(!result.ok && result.error.message).not.toContain("entry_trades");
    expect(String(out.mock.calls[0]?.[0])).toContain("entry_trades_pkey");
  });
});
