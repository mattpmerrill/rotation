import { afterEach, describe, expect, it, vi } from "vitest";
import { authFailure, dbFailure } from "./failure";

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

describe("authFailure", () => {
  function runAuth(code: string | undefined, message = "AuthApiError: something for developers") {
    const out = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    return { result: authFailure("auth.test", { code, message, status: 400 }), out, err };
  }

  it.each([
    ["invalid_credentials", "forbidden", "Wrong email or password."],
    ["email_not_confirmed", "forbidden", "Confirm your email first: check your inbox."],
    ["user_already_exists", "conflict", "That email already has an account."],
    ["email_exists", "conflict", "That email already has an account."],
    ["weak_password", "invalid_input", "Use a password of at least 10 characters."],
    ["signup_disabled", "forbidden", "Sign-ups are closed right now."],
    ["over_request_rate_limit", "unavailable", "Too many attempts. Wait a few minutes and try again."],
    ["over_email_send_rate_limit", "unavailable", "Too many attempts. Wait a few minutes and try again."],
    ["otp_expired", "not_found", "That link has expired or was already used."],
    ["bad_code_verifier", "not_found", "That link has expired or was already used."],
  ])("maps Auth code %s to %s with a fixed message, logged as a warning", (authCode, code, message) => {
    const { result, out, err } = runAuth(authCode);
    expect(!result.ok && result.error).toMatchObject({ code, message });
    expect(out).toHaveBeenCalledTimes(1);
    expect(err).not.toHaveBeenCalled();
  });

  it.each(["unexpected_failure", "validation_failed", undefined])(
    "treats %s as unexpected: generic message, logged as an error with the detail",
    (authCode) => {
      const { result, err } = runAuth(authCode, "Database error saving new user");
      expect(!result.ok && result.error.code).toBe("unexpected");
      expect(!result.ok && result.error.message).not.toContain("Database error");
      expect(String(err.mock.calls[0]?.[0])).toContain("Database error saving new user");
    },
  );

  it("never puts Auth's developer text in a message a user sees", () => {
    const { result } = runAuth("invalid_credentials", "Invalid login credentials for user@example.com");
    expect(!result.ok && result.error.message).not.toContain("user@example.com");
  });
});
