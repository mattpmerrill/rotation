import { revalidatePath } from "next/cache";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requireAdmin } from "@/data/guards";
import { fail, ok } from "@/lib/result";
import { approve, helpLink, reject, removeMember } from "./actions";
import { approvePerson, createHelpLink, rejectPerson, removeMembership } from "./service";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/data/origin", () => ({ requestOrigin: vi.fn(async () => "https://app.example") }));
vi.mock("@/data/guards", () => ({ requireAdmin: vi.fn() }));
vi.mock("./service", () => ({
  approvePerson: vi.fn(),
  createHelpLink: vi.fn(),
  rejectPerson: vi.fn(),
  removeMembership: vi.fn(),
}));

const ADA = "11111111-1111-4111-8111-111111111111";
const admin = { id: "a", email: "m@example.com", name: "Matt", isMember: true, isAdmin: true };

afterEach(() => vi.resetAllMocks());

describe("the admin actions", () => {
  it("check that the caller is an admin before anything else", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error("Only an admin can do that."));
    await expect(approve(ADA)).rejects.toThrow("Only an admin");
    await expect(removeMember(ADA)).rejects.toThrow("Only an admin");
    await expect(reject(ADA)).rejects.toThrow("Only an admin");
    await expect(helpLink(ADA)).rejects.toThrow("Only an admin");
    for (const fn of [approvePerson, removeMembership, rejectPerson, createHelpLink]) expect(fn).not.toHaveBeenCalled();
  });

  it("treat the id as untrusted: only a UUID gets through", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(admin);
    for (const bad of ["", "7", "not-a-uuid", "1 or 1=1", "../../etc", null, undefined, 42] as unknown as string[]) {
      expect((await approve(bad)).error, String(bad)).toBeTruthy();
      expect((await helpLink(bad)).error, String(bad)).toBeTruthy();
    }
    expect(approvePerson).not.toHaveBeenCalled();
    expect(createHelpLink).not.toHaveBeenCalled();
  });

  it("call the matching service and revalidate only on success", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(admin);
    vi.mocked(approvePerson).mockResolvedValue(ok(null));
    vi.mocked(removeMembership).mockResolvedValue(ok(null));
    vi.mocked(rejectPerson).mockResolvedValue(fail("rule_violation", "That doesn't fit the challenge rules."));
    expect(await approve(ADA)).toEqual({});
    expect(await removeMember(ADA)).toEqual({});
    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(await reject(ADA)).toEqual({ error: "That doesn't fit the challenge rules." });
    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(approvePerson).toHaveBeenCalledWith(ADA);
  });

  it("helpLink returns the link, built from this deployment's own origin, or the failure's message", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(admin);
    vi.mocked(createHelpLink).mockResolvedValue(ok({ url: "https://app.example/auth/confirm?x=1" }));
    expect(await helpLink(ADA)).toEqual({ url: "https://app.example/auth/confirm?x=1" });
    expect(createHelpLink).toHaveBeenCalledWith(ADA, "https://app.example");
    vi.mocked(createHelpLink).mockResolvedValue(fail("forbidden", "Admins can't make a help link for another admin."));
    expect(await helpLink(ADA)).toEqual({ error: "Admins can't make a help link for another admin." });
  });
});
