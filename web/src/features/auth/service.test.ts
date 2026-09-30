import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as auth from "@/data/auth.repository";
import { announceOnce } from "./announce";
import { getViewer } from "@/data/viewer.repository";
import type { Viewer } from "@/domain/viewer";
import { fail, ok } from "@/lib/result";
import { changePassword, completeSignIn, confirmHelpLink, createAccount, signIn } from "./service";

vi.mock("server-only", () => ({}));
vi.mock("@/data/auth.repository", () => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  googleSignInUrl: vi.fn(),
  exchangeCode: vi.fn(),
  verifyRecoveryToken: vi.fn(),
  updatePassword: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("./announce", () => ({ announceOnce: vi.fn() }));
vi.mock("@/data/viewer.repository", () => ({ getViewer: vi.fn() }));

const ADMIN_URL = "https://app.example/admin";
const waiting: Viewer = { id: "u9", email: "ada@example.com", name: "Ada", isMember: false, isAdmin: false };
const member: Viewer = { ...waiting, isMember: true };
const input = { email: "ada@example.com", password: "correct horse battery", name: "Ada" };
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? null : r.error?.code);

beforeEach(() => {
  vi.mocked(getViewer).mockResolvedValue(waiting);
  vi.mocked(announceOnce).mockResolvedValue(undefined);
});
afterEach(() => vi.resetAllMocks());

describe("signIn", () => {
  it("tells the admin once about someone who is still waiting, and never includes their email", async () => {
    vi.mocked(auth.signInWithPassword).mockResolvedValue(ok(null));
    expect(await signIn(input.email, input.password, ADMIN_URL)).toEqual(ok(null));
    expect(announceOnce).toHaveBeenCalledWith(
      "waiting:u9",
      "**Ada** signed up and is waiting for approval: " + ADMIN_URL,
    );
    expect(vi.mocked(announceOnce).mock.calls[0]?.[1]).not.toContain("ada@example.com");
  });

  it("says nothing about a member", async () => {
    vi.mocked(auth.signInWithPassword).mockResolvedValue(ok(null));
    vi.mocked(getViewer).mockResolvedValue(member);
    await signIn(input.email, input.password, ADMIN_URL);
    expect(announceOnce).not.toHaveBeenCalled();
  });

  it("returns a failed sign-in as it is and announces nothing", async () => {
    const failure = fail("forbidden", "Wrong email or password.");
    vi.mocked(auth.signInWithPassword).mockResolvedValue(failure);
    expect(await signIn(input.email, "nope", ADMIN_URL)).toEqual(failure);
    expect(announceOnce).not.toHaveBeenCalled();
  });
});

describe("createAccount", () => {
  it("signs a new person straight in when confirmation is off, and tells the admin", async () => {
    vi.mocked(auth.signUp).mockResolvedValue(ok({ signedIn: true }));
    expect(await createAccount(input, "https://app.example/auth/callback", ADMIN_URL)).toEqual(ok({ signedIn: true }));
    expect(auth.signUp).toHaveBeenCalledWith(input.email, input.password, "Ada", "https://app.example/auth/callback");
    expect(announceOnce).toHaveBeenCalledTimes(1);
  });

  it("asks a new person to confirm their email when confirmation is on, and does not announce yet", async () => {
    vi.mocked(auth.signUp).mockResolvedValue(ok({ signedIn: false }));
    expect(await createAccount(input, "u", ADMIN_URL)).toEqual(ok({ signedIn: false }));
    expect(announceOnce).not.toHaveBeenCalled();
  });

  it("signs someone in who signs up again with the same password (they forgot they had an account)", async () => {
    vi.mocked(auth.signUp).mockResolvedValue(fail("conflict", "That email already has an account."));
    vi.mocked(auth.signInWithPassword).mockResolvedValue(ok(null));
    expect(await createAccount(input, "u", ADMIN_URL)).toEqual(ok({ signedIn: true }));
    expect(auth.signInWithPassword).toHaveBeenCalledWith(input.email, input.password);
  });

  it("does not reveal that an email is registered when the password is different", async () => {
    vi.mocked(auth.signUp).mockResolvedValue(fail("conflict", "That email already has an account."));
    vi.mocked(auth.signInWithPassword).mockResolvedValue(fail("forbidden", "Wrong email or password."));
    const result = await createAccount(input, "u", ADMIN_URL);
    expect(code(result)).toBe("conflict");
    const message = !result.ok ? result.error.message : "";
    expect(message).toMatch(/couldn't create that account/i);
    expect(message).not.toMatch(/already has an account|already registered|already exists/i);
    expect(announceOnce).not.toHaveBeenCalled();
  });

  it("passes any other failure through, without trying to sign in", async () => {
    const failure = fail("unavailable", "Too many attempts. Wait a few minutes and try again.");
    vi.mocked(auth.signUp).mockResolvedValue(failure);
    expect(await createAccount(input, "u", ADMIN_URL)).toEqual(failure);
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe("the other entry points", () => {
  it("completeSignIn announces a waiting person only after the code is accepted", async () => {
    vi.mocked(auth.exchangeCode).mockResolvedValue(fail("not_found", "That link has expired or was already used."));
    expect(code(await completeSignIn("bad", ADMIN_URL))).toBe("not_found");
    expect(announceOnce).not.toHaveBeenCalled();
    vi.mocked(auth.exchangeCode).mockResolvedValue(ok(null));
    expect((await completeSignIn("good", ADMIN_URL)).ok).toBe(true);
    expect(announceOnce).toHaveBeenCalledTimes(1);
  });

  it("confirmHelpLink and changePassword go straight to the repository", async () => {
    vi.mocked(auth.verifyRecoveryToken).mockResolvedValue(ok(null));
    vi.mocked(auth.updatePassword).mockResolvedValue(ok(null));
    expect((await confirmHelpLink("hash")).ok).toBe(true);
    expect(auth.verifyRecoveryToken).toHaveBeenCalledWith("hash");
    expect((await changePassword("a-new-password")).ok).toBe(true);
    expect(auth.updatePassword).toHaveBeenCalledWith("a-new-password");
  });
});
