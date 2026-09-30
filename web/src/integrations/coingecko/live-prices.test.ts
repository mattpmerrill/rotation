import { afterEach, describe, expect, it, vi } from "vitest";
import { getLivePrices } from "./live-prices";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function scripted(response: () => Response | Promise<Response>) {
  const calls: { url: string; headers: HeadersInit | undefined }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: init?.headers });
    return response();
  }) as unknown as typeof fetch; // a scripted stand-in for fetch: only the call's url and headers are read
  return { fetchImpl, calls };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getLivePrices", () => {
  it("returns the domain shape: usd prices by coin id and the newest quote time in ms", async () => {
    const { fetchImpl, calls } = scripted(() =>
      json({
        bitcoin: { usd: 100_000, last_updated_at: 1_700_000_000 },
        solana: { usd: 150, last_updated_at: 1_700_000_050 },
      }),
    );
    const live = await getLivePrices(["solana", "bitcoin", "bitcoin"], { fetchImpl });
    expect(live).toEqual({ prices: { bitcoin: 100_000, solana: 150 }, at: 1_700_000_050_000 });
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]?.url ?? "");
    expect(url.searchParams.get("ids")).toBe("bitcoin,solana");
  });

  it("sends the demo key when there is one, and none when there is not", async () => {
    const withKey = scripted(() => json({ bitcoin: { usd: 1 } }));
    await getLivePrices(["bitcoin"], { fetchImpl: withKey.fetchImpl, apiKey: "demo-key" });
    expect(withKey.calls[0]?.headers).toEqual({ "x-cg-demo-api-key": "demo-key" });
    const keyless = scripted(() => json({ bitcoin: { usd: 1 } }));
    await getLivePrices(["bitcoin"], { fetchImpl: keyless.fetchImpl });
    expect(keyless.calls[0]?.headers).toEqual({});
  });

  it("skips a malformed or non-positive quote and keeps the rest", async () => {
    const { fetchImpl } = scripted(() =>
      json({ bitcoin: { usd: 100 }, junk: { usd: "lots" }, dead: { usd: 0 }, empty: null }),
    );
    const live = await getLivePrices(["bitcoin", "junk", "dead", "empty"], { fetchImpl });
    expect(Object.keys(live?.prices ?? {})).toEqual(["bitcoin"]);
  });

  it("does not call CoinGecko without ids", async () => {
    const { fetchImpl } = scripted(() => json({}));
    expect(await getLivePrices([], { fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns null, and logs, when CoinGecko answers an error", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { fetchImpl } = scripted(() => json({ status: { error_code: 429 } }, 429));
    expect(await getLivePrices(["bitcoin"], { fetchImpl })).toBeNull();
    expect(String(log.mock.calls[0]?.[0])).toContain("coingecko.live_prices_failed");
  });

  it("returns null when the body is not the shape we expect", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { fetchImpl } = scripted(() => json([1, 2, 3]));
    expect(await getLivePrices(["bitcoin"], { fetchImpl })).toBeNull();
  });

  it("returns null when the request fails or times out", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { fetchImpl } = scripted(() => Promise.reject(new DOMException("timed out", "TimeoutError")));
    expect(await getLivePrices(["bitcoin"], { fetchImpl })).toBeNull();
  });
});
