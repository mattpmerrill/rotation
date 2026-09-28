import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const base = { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test" };

async function statusWith(extra: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries({ ...base, ...extra })) vi.stubEnv(k, v);
  return (await import("./status")).healthStatus();
}

afterEach(() => vi.unstubAllEnvs());

describe("healthStatus", () => {
  it("reports the commit Vercel built from", async () => {
    expect(await statusWith({ VERCEL_GIT_COMMIT_SHA: "0123456789abcdef" })).toEqual({
      ok: true,
      commit: "0123456789abcdef",
    });
  });

  it("reports no commit when it is not set, as when running locally", async () => {
    expect(await statusWith({ VERCEL_GIT_COMMIT_SHA: "" })).toEqual({ ok: true, commit: null });
  });
});
