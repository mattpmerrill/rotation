import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/result";
import { completeSignInFromRequest, confirmFromRequest } from "./callback";
import { completeSignIn, confirmHelpLink } from "./service";

vi.mock("server-only", () => ({}));
vi.mock("./service", () => ({ completeSignIn: vi.fn(), confirmHelpLink: vi.fn() }));

const at = (path: string) => new NextRequest(`https://app.example${path}`);
const where = (r: Response) => r.headers.get("location");

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe("the sign-in callback", () => {
  it("never puts text from the URL in front of the visitor: a provider error becomes a fixed code", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const response = await completeSignInFromRequest(
      at("/auth/callback?error=access_denied&error_description=Call+555-0100+to+unlock+your+account"),
    );
    expect(where(response)).toBe("https://app.example/login?error=denied");
    expect(where(response)).not.toContain("555");
    expect(completeSignIn).not.toHaveBeenCalled();
  });

  it("treats a missing code as an expired link", async () => {
    expect(where(await completeSignInFromRequest(at("/auth/callback")))).toBe(
      "https://app.example/login?error=expired",
    );
  });

  it("maps a failed exchange to 'expired' or 'failed', never to Auth's own text", async () => {
    vi.mocked(completeSignIn).mockResolvedValue(fail("not_found", "That link has expired or was already used."));
    expect(where(await completeSignInFromRequest(at("/auth/callback?code=abc")))).toBe(
      "https://app.example/login?error=expired",
    );
    vi.mocked(completeSignIn).mockResolvedValue(fail("unexpected", "Something went wrong on our side."));
    expect(where(await completeSignInFromRequest(at("/auth/callback?code=abc")))).toBe(
      "https://app.example/login?error=failed",
    );
  });

  it("on success follows a same-site next path, and ignores one that leaves the site", async () => {
    vi.mocked(completeSignIn).mockResolvedValue(ok(null));
    expect(where(await completeSignInFromRequest(at("/auth/callback?code=abc&next=/pick")))).toBe(
      "https://app.example/pick",
    );
    expect(where(await completeSignInFromRequest(at("/auth/callback?code=abc&next=//evil.example")))).toBe(
      "https://app.example/",
    );
    expect(where(await completeSignInFromRequest(at("/auth/callback?code=abc&next=https://evil.example")))).toBe(
      "https://app.example/",
    );
    expect(completeSignIn).toHaveBeenCalledWith("abc", "https://app.example/admin");
  });
});

describe("the help-link route", () => {
  it("accepts only a recovery link with a token", async () => {
    expect(where(await confirmFromRequest(at("/auth/confirm")))).toBe("https://app.example/login?error=expired");
    expect(where(await confirmFromRequest(at("/auth/confirm?token_hash=abc&type=signup")))).toBe(
      "https://app.example/login?error=expired",
    );
    expect(where(await confirmFromRequest(at("/auth/confirm?type=recovery")))).toBe(
      "https://app.example/login?error=expired",
    );
    expect(confirmHelpLink).not.toHaveBeenCalled();
  });

  it("signs the person in and sends them to choose a new password", async () => {
    vi.mocked(confirmHelpLink).mockResolvedValue(ok(null));
    expect(where(await confirmFromRequest(at("/auth/confirm?token_hash=abc&type=recovery")))).toBe(
      "https://app.example/auth/reset",
    );
    expect(confirmHelpLink).toHaveBeenCalledWith("abc");
  });

  it("sends a used or expired link to sign-in with the fixed 'expired' message", async () => {
    vi.mocked(confirmHelpLink).mockResolvedValue(fail("not_found", "That link has expired or was already used."));
    expect(where(await confirmFromRequest(at("/auth/confirm?token_hash=abc&type=recovery")))).toBe(
      "https://app.example/login?error=expired",
    );
  });
});
