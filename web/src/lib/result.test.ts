import { describe, expect, it } from "vitest";
import { fail, FORM, formMessages, ok, type ApplicationResult } from "./result";

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

describe("formMessages", () => {
  it("returns the whole form-level list when a failure has one", () => {
    const result = fail("rule_violation", "First. Second.", { [FORM]: ["First.", "Second."] });
    expect(!result.ok && formMessages(result.error)).toEqual(["First.", "Second."]);
  });

  it("falls back to the single message, including when the list is empty or on another field", () => {
    const plain = fail("forbidden", "No.");
    expect(!plain.ok && formMessages(plain.error)).toEqual(["No."]);
    const empty = fail("forbidden", "No.", { [FORM]: [] });
    expect(!empty.ok && formMessages(empty.error)).toEqual(["No."]);
    const other = fail("forbidden", "No.", { qty: ["Bad."] });
    expect(!other.ok && formMessages(other.error)).toEqual(["No."]);
  });
});
