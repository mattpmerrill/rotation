/** Shared test data: one entry that buys SOL and LINK with 1 BTC. Test-only. */
import type { Entry, PriceBook, Trade, TradeKind } from "./types";

export const entry: Entry = {
  id: 1,
  challengeId: 1,
  userId: "u1",
  playerName: "Alice",
  startedOn: "2026-10-01",
  btcIn: 1,
  basket: ["solana", "chainlink"],
  openSlots: 0,
};

let nextId = 1;
/** A trade; its kind defaults from what it does (alt sold: sell, BTC bought: rebuy, else buy_in). */
export const trade = (
  t: Omit<Trade, "id" | "entryId" | "note" | "feeUsd" | "kind"> & { feeUsd?: number; kind?: TradeKind },
): Trade => ({
  id: nextId++,
  entryId: entry.id,
  note: null,
  feeUsd: 0,
  kind: t.asset === "bitcoin" ? (t.side === "buy" ? "rebuy" : "buy_in") : t.side === "sell" ? "sell" : "buy_in",
  ...t,
});

/** Buy-in at BTC $100k: 250 SOL at $200 and 2,500 LINK at $20, no fees. */
export const buyIn: Trade[] = [
  trade({ tradedOn: "2026-10-01", asset: "bitcoin", side: "sell", qty: 1, priceUsd: 100_000 }),
  trade({ tradedOn: "2026-10-01", asset: "solana", side: "buy", qty: 250, priceUsd: 200 }),
  trade({ tradedOn: "2026-10-01", asset: "chainlink", side: "buy", qty: 2500, priceUsd: 20 }),
];

/** Three days: SOL doubles on day 2, BTC rises 25% on day 3; LINK has no price on day 3. */
export const prices: PriceBook = {
  bitcoin: { dates: ["2026-10-01", "2026-10-02", "2026-10-03"], closes: [100_000, 100_000, 125_000] },
  solana: { dates: ["2026-10-01", "2026-10-02", "2026-10-03"], closes: [200, 400, 400] },
  chainlink: { dates: ["2026-10-01", "2026-10-02"], closes: [20, 20] },
};
