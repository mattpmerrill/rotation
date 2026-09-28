import Link from "next/link";
import { requireViewer } from "@/data/viewer";
import { LeaderboardList } from "@/features/leaderboard/components/leaderboard-list";
import { MarketStrip } from "@/features/leaderboard/components/market-strip";
import { getLeaderboard } from "@/features/leaderboard/queries";
import { formatDay } from "@/lib/format";
import { buttonClass } from "@/ui/button";
import { LiveRefresh } from "@/ui/live-refresh";
import { Notice } from "@/ui/notice";

export default async function LeaderboardPage() {
  const viewer = await requireViewer();
  if (!viewer.isMember) return null; // the layout explains how to get in
  const board = await getLeaderboard(viewer);
  if (!board) return <Notice>No challenge has opened yet.</Notice>;

  const players = board.rows.length;
  return (
    <>
      <section className="grid gap-5">
        <div className="grid gap-3">
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-5xl">{board.challenge.name}</h1>
          <p className="text-ink-2 max-w-2xl text-lg">
            Everyone swaps up to 1 BTC into alts, sells near the top and rebuys BTC in the bear. Ranked by BTC now
            against BTC put in.
            {players > 0 &&
              ` ${players} ${players === 1 ? "player" : "players"} since ${formatDay(board.challenge.openedOn)}.`}
          </p>
        </div>
        {board.market && <MarketStrip market={board.market} />}
        {!board.complete && <LiveRefresh liveAt={board.liveAt} />}
      </section>

      {board.complete && (
        <Notice tone="success">
          Everyone is back in BTC: the challenge is over. The next one opens when Matt starts it.
        </Notice>
      )}

      {!board.viewerEntryId && !board.challenge.closedOn && (
        <div className="panel border-btc/40 flex flex-wrap items-center justify-between gap-4 bg-[linear-gradient(110deg,rgb(247_147_26/0.16),rgb(144_133_233/0.08))] px-5 py-5 sm:px-6">
          <p className="text-lg">
            {players
              ? "You're not in yet. Pick your coins and choose when to buy in."
              : "Nobody's in yet. Pick your coins and be first."}
          </p>
          <Link href="/pick" className={buttonClass("primary")}>
            Pick a basket
          </Link>
        </div>
      )}

      {players > 0 && <LeaderboardList rows={board.rows} />}
    </>
  );
}
