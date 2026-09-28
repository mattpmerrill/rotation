import { describe, expect, it } from "vitest";
import { loginErrorMessage } from "./login-errors";

describe("loginErrorMessage", () => {
  it("returns the fixed message for each known code", () => {
    expect(loginErrorMessage("expired")).toMatch(/expired or was already used/);
    expect(loginErrorMessage("denied")).toMatch(/cancelled/);
    expect(loginErrorMessage("failed")).toMatch(/didn't work/);
  });

  it("returns nothing for anything else, so URL text is never shown", () => {
    for (const code of [
      undefined,
      "",
      "Your account is locked: call 555-0100",
      "<b>hi</b>",
      "toString",
      "__proto__",
      "constructor",
    ])
      expect(loginErrorMessage(code), String(code)).toBeUndefined();
  });
});
