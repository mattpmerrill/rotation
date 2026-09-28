import { redirect } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requireViewer } from "@/data/viewer";
import { fail, ok } from "@/lib/result";
import { setNewPassword, signIn, signUp } from "./actions";
import { changePassword, createAccount, signIn as signInUseCase } from "./service";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));
vi.mock("@/data/origin", () => ({ requestOrigin: vi.fn(async () => "https://app.example") }));
vi.mock("@/data/viewer", () => ({ requireViewer: vi.fn() }));
vi.mock("./service", () => ({
  changePassword: vi.fn(),
  createAccount: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  startGoogleSignIn: vi.fn(),
}));

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
};
const good = { name: "Ada", email: "ada@example.com", password: "correct horse battery" };

afterEach(() => vi.resetAllMocks());

describe("signIn", () => {
  it("validates the form before calling the service", async () => {
    expect((await signIn({}, form({ email: "nope", password: "x".repeat(12) }))).error).toBe("Enter a valid email.");
    expect((await signIn({}, form({ email: "a@b.co", password: "short" }))).error).toMatch(/at least 10/);
    expect(signInUseCase).not.toHaveBeenCalled();
  });

  it("shows the service's message on a failure and redirects home on success", async () => {
    vi.mocked(signInUseCase).mockResolvedValue(fail("forbidden", "Wrong email or password."));
    expect(await signIn({}, form({ email: good.email, password: good.password }))).toEqual({
      error: "Wrong email or password.",
    });
    vi.mocked(signInUseCase).mockResolvedValue(ok(null));
    await expect(signIn({}, form({ email: good.email, password: good.password }))).rejects.toThrow("NEXT_REDIRECT /");
    expect(signInUseCase).toHaveBeenLastCalledWith(good.email, good.password, "https://app.example/admin");
  });
});

describe("signUp", () => {
  it("asks for a name, a valid email and a password of at least 10 characters", async () => {
    expect((await signUp({}, form({ ...good, name: "   " }))).error).toBe("Enter your name.");
    expect((await signUp({}, form({ ...good, name: "x".repeat(61) }))).error).toBe("Use a shorter name.");
    expect((await signUp({}, form({ ...good, email: "ada" }))).error).toBe("Enter a valid email.");
    expect((await signUp({}, form({ ...good, password: "123456789" }))).error).toMatch(/at least 10/);
    expect(createAccount).not.toHaveBeenCalled();
  });

  it("trims the name, and sends the person to the app when they are signed in straight away", async () => {
    vi.mocked(createAccount).mockResolvedValue(ok({ signedIn: true }));
    await expect(signUp({}, form({ ...good, name: "  Ada  " }))).rejects.toThrow("NEXT_REDIRECT /");
    expect(createAccount).toHaveBeenCalledWith(
      { name: "Ada", email: good.email, password: good.password },
      "https://app.example/auth/callback",
      "https://app.example/admin",
    );
  });

  it("asks them to check their email when confirmation is on, and shows a failure's message", async () => {
    vi.mocked(createAccount).mockResolvedValue(ok({ signedIn: false }));
    expect(await signUp({}, form(good))).toEqual({ sent: true });
    vi.mocked(createAccount).mockResolvedValue(
      fail("unavailable", "Too many attempts. Wait a few minutes and try again."),
    );
    expect(await signUp({}, form(good))).toEqual({ error: "Too many attempts. Wait a few minutes and try again." });
    expect(redirect).toHaveBeenCalledTimes(0);
  });
});

describe("setNewPassword", () => {
  it("needs a signed-in person, matching passwords of at least 10 characters", async () => {
    vi.mocked(requireViewer).mockRejectedValue(new Error("redirect to login"));
    await expect(setNewPassword({}, form({ password: "a".repeat(12), confirm: "a".repeat(12) }))).rejects.toThrow();
    expect(changePassword).not.toHaveBeenCalled();

    vi.mocked(requireViewer).mockResolvedValue({ id: "u", email: "e", name: "n", isMember: false, isAdmin: false });
    expect((await setNewPassword({}, form({ password: "a".repeat(12), confirm: "b".repeat(12) }))).error).toBe(
      "The two passwords don't match.",
    );
    expect((await setNewPassword({}, form({ password: "short", confirm: "short" }))).error).toMatch(/at least 10/);
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("saves the password and goes home", async () => {
    vi.mocked(requireViewer).mockResolvedValue({ id: "u", email: "e", name: "n", isMember: false, isAdmin: false });
    vi.mocked(changePassword).mockResolvedValue(ok(null));
    await expect(setNewPassword({}, form({ password: "a".repeat(12), confirm: "a".repeat(12) }))).rejects.toThrow(
      "NEXT_REDIRECT /",
    );
    expect(changePassword).toHaveBeenCalledWith("a".repeat(12));
  });
});
