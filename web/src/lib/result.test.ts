import { describe, expect, it } from "vitest";
import { fail, ok, type ApplicationResult } from "./result";

describe("ApplicationResult", () => {
  it("ok carries the data", () => {
    expect(ok({ id: 1 })).toEqual({ ok: true, data: { id: 1 } });
    expect(ok(null)).toEqual({ ok: true, data: null });
  });

  it("fail carries a stable code and a message, and optional field errors", () => {
    expect(fail("forbidden", "No.")).toEqual({
      ok: false,
      error: { code: "forbidden", message: "No.", fieldErrors: undefined },
    });
    const withFields = fail("invalid_input", "Check the form.", { qty: ["Enter an amount."] });
    expect(!withFields.ok && withFields.error.fieldErrors).toEqual({ qty: ["Enter an amount."] });
  });

  it("a failure is assignable to any result type, and the ok flag narrows it", () => {
    const result: ApplicationResult<number> = fail("not_found", "Gone.");
    if (result.ok) throw new Error("expected a failure");
    expect(result.error.code).toBe("not_found");
  });
});
