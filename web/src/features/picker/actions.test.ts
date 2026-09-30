import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requireMember } from "@/data/guards";
import type { Viewer } from "@/domain/viewer";
import { fail, FORM, ok } from "@/lib/result";
import { editBasket, removeBasket, startChallenge } from "./actions";
import { deleteBasket, enterChallenge, redoBuyIn } from "./service";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Next's redirect() works by throwing; do the same so code after it does not run.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));
vi.mock("@/data/guards", () => ({ requireMember: vi.fn() }));
vi.mock("./service", () => ({ enterChallenge: vi.fn(), redoBuyIn: vi.fn(), deleteBasket: vi.fn() }));

const viewer: Viewer = { id: "u1", email: "a@example.com", name: "A", isMember: true, isAdmin: false };
const payload = {
  startedOn: "2026-10-03",
  btcIn: 1,
  basket: ["solana", "chainlink"],
  slots: 0,
  trades: [
    { asset: "bitcoin", side: "sell", qty: 1, priceUsd: 100000, feeUsd: 1000 },
    { asset: "solana", side: "buy", qty: 247.5, priceUsd: 200, feeUsd: 495 },
  ],
};
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
};
const submitted = (over: Record<string, string> = {}) => form({ payload: JSON.stringify(payload), ...over });

afterEach(() => vi.resetAllMocks());

describe("the picker actions", () => {
  it("authenticate first: a non-member never reaches parsing or a service", async () => {
    vi.mocked(requireMember).mockRejectedValue(new Error("Only challenge members can do that."));
    await expect(startChallenge({}, submitted())).rejects.toThrow("Only challenge members");
    await expect(editBasket({}, submitted({ entryId: "1" }))).rejects.toThrow("Only challenge members");
    await expect(removeBasket(1)).rejects.toThrow("Only challenge members");
    expect(enterChallenge).not.toHaveBeenCalled();
    expect(redoBuyIn).not.toHaveBeenCalled();
    expect(deleteBasket).not.toHaveBeenCalled();
  });

  describe("startChallenge", () => {
    it("refuses an unreadable or invalid payload without calling the service", async () => {
      vi.mocked(requireMember).mockResolvedValue(viewer);
      const broken = await startChallenge({}, form({ payload: "{not json" }));
      expect(broken.errors?.[0]).toMatch(/Something went wrong reading the form/);
      const missing = await startChallenge({}, form({}));
      expect(missing.errors?.[0]).toMatch(/Something went wrong reading the form/);
      const tooMuch = await startChallenge({}, form({ payload: JSON.stringify({ ...payload, btcIn: 5 }) }));
      expect(tooMuch.errors).toContain("Put in at most 1 BTC.");
      expect(enterChallenge).not.toHaveBeenCalled();
    });

    it("shows every message from a rule failure and does not redirect", async () => {
      vi.mocked(requireMember).mockResolvedValue(viewer);
      vi.mocked(enterChallenge).mockResolvedValue(fail("rule_violation", "A. B.", { [FORM]: ["A.", "B."] }));
      expect(await startChallenge({}, submitted())).toEqual({ errors: ["A.", "B."] });
      expect(redirect).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("shows a single message when the failure has no list", async () => {
      vi.mocked(requireMember).mockResolvedValue(viewer);
      vi.mocked(enterChallenge).mockResolvedValue(fail("conflict", "You're already in this challenge."));
      expect(await startChallenge({}, submitted())).toEqual({ errors: ["You're already in this challenge."] });
    });

    it("on success passes the viewer and parsed input, revalidates, then redirects to the new entry", async () => {
      vi.mocked(requireMember).mockResolvedValue(viewer);
      vi.mocked(enterChallenge).mockResolvedValue(ok({ entryId: 9 }));
      await expect(startChallenge({}, submitted())).rejects.toThrow("NEXT_REDIRECT /entries/9");
      expect(enterChallenge).toHaveBeenCalledWith(
        viewer,
        expect.objectContaining({ startedOn: "2026-10-03", btcIn: 1 }),
      );
      expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    });
  });

  describe("editBasket", () => {
    it("treats the entry id as untrusted input", async () => {
      vi.mocked(requireMember).mockResolvedValue(viewer);
      for (const bad of ["", "abc", "-1", "0", "1.5"]) {
        const state = await editBasket({}, submitted({ entryId: bad }));
        expect(state.errors?.[0], bad).toMatch(/Something went wrong reading the form/);
      }
      expect(redoBuyIn).not.toHaveBeenCalled();
    });

    it("passes the parsed id and input to the service and redirects to the entry on success", async () => {
      vi.mocked(requireMember).mockResolvedValue(viewer);
      vi.mocked(redoBuyIn).mockResolvedValue(ok({ entryId: 4 }));
      await expect(editBasket({}, submitted({ entryId: "4" }))).rejects.toThrow("NEXT_REDIRECT /entries/4");
      expect(redoBuyIn).toHaveBeenCalledWith(viewer, 4, expect.objectContaining({ btcIn: 1 }));
    });

    it("shows the service's messages on a failure", async () => {
      vi.mocked(requireMember).mockResolvedValue(viewer);
      vi.mocked(redoBuyIn).mockResolvedValue(fail("forbidden", "You can only edit your own basket."));
      expect(await editBasket({}, submitted({ entryId: "4" }))).toEqual({
        errors: ["You can only edit your own basket."],
      });
    });
  });

  describe("removeBasket", () => {
    it("treats its argument as untrusted: only a positive integer gets through", async () => {
      vi.mocked(requireMember).mockResolvedValue(viewer);
      for (const bad of [0, -2, 1.5, NaN, "7", null, undefined] as unknown as number[]) {
        expect((await removeBasket(bad)).error, String(bad)).toBeTruthy();
      }
      expect(deleteBasket).not.toHaveBeenCalled();
    });

    it("reports a refusal without redirecting, and redirects to the picker on success", async () => {
      vi.mocked(requireMember).mockResolvedValue(viewer);
      vi.mocked(deleteBasket).mockResolvedValue(fail("forbidden", "You can only delete your own basket."));
      expect(await removeBasket(3)).toEqual({ error: "You can only delete your own basket." });
      expect(redirect).not.toHaveBeenCalled();

      vi.mocked(deleteBasket).mockResolvedValue(ok(null));
      await expect(removeBasket(3)).rejects.toThrow("NEXT_REDIRECT /pick");
      expect(deleteBasket).toHaveBeenLastCalledWith(viewer, 3);
    });
  });
});
