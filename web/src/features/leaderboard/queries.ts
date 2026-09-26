import "server-only";
import { getMarketState, type MarketState } from "@/data/market";
import { loadCurrentChallenge } from "@/data/snapshot";
import type { Viewer } from "@/data/viewer";
import { isChallengeComplete, rankStandings, standingOf } from "@/domain/standings";
import type { Challenge, Coin, Phase } from "@/domain/types";
import { todayUtc } from "@/lib/days";

export interface LeaderboardRow {
  entryId: number;
  playerName: string;
  isViewer: boolean;
  startedOn: string;
  btcIn: number;
  coins: Coin[];
  phase: Phase;
  multiple: number | null;
  valueBtc: number | null;
  valueUsd: number | null;
  best: number | null;
  worst: number | null;
  spark: number[];
}

export interface Leaderboard {
  challenge: Challenge;
  rows: LeaderboardRow[];
  complete: boolean;
  viewerEntryId: number | null;
  market: MarketState | null;
}

export async function getLeaderboard(viewer: Viewer): Promise<Leaderboard | null> {
  const [snap, market] = await Promise.all([loadCurrentChallenge(), getMarketState()]);
  if (!snap) return null;
  const today = todayUtc();
  const standings = rankStandings(
    snap.entries.map((e) =>
      standingOf(
        e,
        snap.trades.filter((t) => t.entryId === e.id),
        snap.prices,
        today,
      ),
    ),
  );
  return {
    challenge: snap.challenge,
    complete: isChallengeComplete(standings),
    viewerEntryId: snap.entries.find((e) => e.userId === viewer.id)?.id ?? null,
    market,
    rows: standings.map((s) => ({
      entryId: s.entry.id,
      playerName: s.entry.playerName,
      isViewer: s.entry.userId === viewer.id,
      startedOn: s.entry.startedOn,
      btcIn: s.entry.btcIn,
      coins: s.entry.basket.map((id) => snap.coins[id] ?? { id, symbol: id.toUpperCase(), name: id }),
      phase: s.phase,
      multiple: s.multiple,
      valueBtc: s.now?.totalBtc ?? null,
      valueUsd: s.now?.totalUsd ?? null,
      best: s.best,
      worst: s.worst,
      spark: s.history.map((h) => h.multiple),
    })),
  };
}
