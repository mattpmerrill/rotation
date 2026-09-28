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
  openSlots: number;
  phase: Phase;
  /** Where the entry stands today; null while a held coin has no price yet. */
  now: { multiple: number; valueBtc: number; valueUsd: number } | null;
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
  liveAt: number | null;
}

export async function getLeaderboard(viewer: Viewer): Promise<Leaderboard | null> {
  const [snap, market] = await Promise.all([loadCurrentChallenge(undefined, { live: true }), getMarketState()]);
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
    liveAt: snap.liveAt,
    rows: standings.map((s) => ({
      entryId: s.entry.id,
      playerName: s.entry.playerName,
      isViewer: s.entry.userId === viewer.id,
      startedOn: s.entry.startedOn,
      btcIn: s.entry.btcIn,
      coins: s.entry.basket.map((id) => snap.coins[id] ?? { id, symbol: id.toUpperCase(), name: id, image: null }),
      openSlots: s.entry.openSlots,
      phase: s.phase,
      now:
        s.now && s.multiple !== null
          ? { multiple: s.multiple, valueBtc: s.now.totalBtc, valueUsd: s.now.totalUsd }
          : null,
      best: s.best,
      worst: s.worst,
      spark: s.history.map((h) => h.multiple),
    })),
  };
}
