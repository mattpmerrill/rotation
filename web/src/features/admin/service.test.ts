import { afterEach, describe, expect, it, vi } from "vitest";
import { createRecoveryToken } from "@/data/auth-admin";
import { listPeople, recordHelpLink, rejectSignup, setMember } from "@/data/people";
import type { Person } from "@/domain/people";
import { fail, ok } from "@/lib/result";
import { approvePerson, createHelpLink, rejectPerson, removeMembership } from "./service";

vi.mock("server-only", () => ({}));
vi.mock("@/data/auth-admin", () => ({ createRecoveryToken: vi.fn() }));
vi.mock("@/data/people", () => ({
  listPeople: vi.fn(),
  recordHelpLink: vi.fn(),
  rejectSignup: vi.fn(),
  setMember: vi.fn(),
}));

const person = (over: Partial<Person>): Person => ({
  id: "11111111-1111-4111-8111-111111111111",
  email: "ada@example.com",
  name: "Ada",
  isMember: true,
  isAdmin: false,
  signedUpAt: "2026-10-01T10:00:00Z",
  provider: "email",
  ...over,
});
const ADA = "11111111-1111-4111-8111-111111111111";
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? null : r.error?.code);

afterEach(() => vi.resetAllMocks());

describe("approving, removing and rejecting", () => {
  it("approve and remove set membership true and false, and pass the repository's result back", async () => {
    vi.mocked(setMember).mockResolvedValue(ok(null));
    expect(await approvePerson(ADA)).toEqual(ok(null));
    expect(setMember).toHaveBeenLastCalledWith(ADA, true);
    expect(await removeMembership(ADA)).toEqual(ok(null));
    expect(setMember).toHaveBeenLastCalledWith(ADA, false);
    const denied = fail("forbidden", "You can't do that.");
    vi.mocked(setMember).mockResolvedValue(denied);
    expect(await approvePerson(ADA)).toEqual(denied);
  });

  it("reject deletes an unapproved account through the repository", async () => {
    vi.mocked(rejectSignup).mockResolvedValue(ok(null));
    expect(await rejectPerson(ADA)).toEqual(ok(null));
    expect(rejectSignup).toHaveBeenCalledWith(ADA);
  });
});

describe("createHelpLink", () => {
  const origin = "https://app.example";

  it("records the action first, then makes a one-time link to the confirm route", async () => {
    vi.mocked(listPeople).mockResolvedValue(ok([person({})]));
    vi.mocked(recordHelpLink).mockResolvedValue(ok(null));
    vi.mocked(createRecoveryToken).mockResolvedValue(ok({ tokenHash: "abc+/=" }));
    const result = await createHelpLink(ADA, origin);
    expect(result).toEqual(ok({ url: "https://app.example/auth/confirm?token_hash=abc%2B%2F%3D&type=recovery" }));
    expect(vi.mocked(recordHelpLink).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(createRecoveryToken).mock.invocationCallOrder[0] ?? 0,
    );
    expect(createRecoveryToken).toHaveBeenCalledWith("ada@example.com");
  });

  it("never makes a link, or even touches Auth, when the action could not be recorded", async () => {
    vi.mocked(listPeople).mockResolvedValue(ok([person({})]));
    vi.mocked(recordHelpLink).mockResolvedValue(fail("forbidden", "You can't do that."));
    expect(code(await createHelpLink(ADA, origin))).toBe("forbidden");
    expect(createRecoveryToken).not.toHaveBeenCalled();
  });

  it("refuses to make a link for another admin, or for someone who isn't there", async () => {
    vi.mocked(listPeople).mockResolvedValue(ok([person({ isAdmin: true })]));
    const admin = await createHelpLink(ADA, origin);
    expect(code(admin)).toBe("forbidden");
    expect(!admin.ok && admin.error.message).toMatch(/another admin/);
    expect(code(await createHelpLink("22222222-2222-4222-8222-222222222222", origin))).toBe("not_found");
    expect(recordHelpLink).not.toHaveBeenCalled();
    expect(createRecoveryToken).not.toHaveBeenCalled();
  });

  it("passes a failed list, or a failed token, through", async () => {
    vi.mocked(listPeople).mockResolvedValue(fail("forbidden", "You can't do that."));
    expect(code(await createHelpLink(ADA, origin))).toBe("forbidden");
    vi.mocked(listPeople).mockResolvedValue(ok([person({})]));
    vi.mocked(recordHelpLink).mockResolvedValue(ok(null));
    vi.mocked(createRecoveryToken).mockResolvedValue(fail("unexpected", "Something went wrong on our side."));
    expect(code(await createHelpLink(ADA, origin))).toBe("unexpected");
  });
});
