import Link from "next/link";
import { requireViewer } from "@/data/viewer";
import { LeaderboardList } from "@/features/leaderboard/components/LeaderboardList";
import { MarketStrip } from "@/features/leaderboard/components/MarketStrip";
import { getLeaderboard } from "@/features/leaderboard/queries";
import { formatDay } from "@/lib/format";
import { buttonClass } from "@/ui/Button";
import { Notice } from "@/ui/Notice";

export default async function LeaderboardPage() {
  const viewer = await requireViewer();
  if (!viewer.isMember) return null; // the layout explains how to get in
  const board = await getLeaderboard(viewer);
  if (!board) return <Notice>No challenge has opened yet.</Notice>;

  const players = board.rows.length;
  return (
    <>
      <section className="grid gap-4">
        <h1 className="text-3xl font-semibold sm:text-4xl">Leaderboard</h1>
        <p className="text-ink-2 max-w-2xl">
          Everyone swaps up to 1 BTC into alts, sells near the top and rebuys BTC in the bear. Ranked by BTC now against
          BTC put in.
          {players > 0 &&
            ` ${players} ${players === 1 ? "player" : "players"} since ${formatDay(board.challenge.openedOn)}.`}
        </p>
        {board.market && <MarketStrip market={board.market} />}
      </section>

      {board.complete && (
        <Notice tone="success">
          Everyone is back in BTC: the challenge is over. The next one opens when Matt starts it.
        </Notice>
      )}

      {!board.viewerEntryId && !board.challenge.closedOn && (
        <div className="border-btc/40 bg-btc/5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-5 py-4">
          <p>
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
