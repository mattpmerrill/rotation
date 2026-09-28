import Link from "next/link";
import { formatDay, formatMultiple } from "@/lib/format";
import { Change } from "@/ui/change";
import { CoinStack } from "@/ui/coin-stack";
import { Medal } from "@/ui/medal";
import { PhaseBadge } from "@/ui/phase-badge";
import { Sparkline } from "@/ui/charts/sparkline";
import { Money } from "@/ui/unit";
import type { LeaderboardRow } from "../queries";

/** The standings: highest BTC multiple first. Each row opens that player's basket. */
export function LeaderboardList({ rows }: { rows: LeaderboardRow[] }) {
  return (
    <ol className="grid gap-3">
      {rows.map((r, i) => {
        const leader = i === 0 && r.now != null;
        return (
          <li key={r.entryId}>
            <Link
              href={`/entries/${r.entryId}`}
              className={`panel hover:border-btc/40 grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-4 transition hover:-translate-y-px sm:grid-cols-[auto_1fr_auto_auto] sm:px-6 ${
                leader ? "border-gold/40 bg-[linear-gradient(110deg,rgb(247_147_26/0.14),transparent_55%)]" : ""
              }`}
            >
              <Medal place={i + 1} />

              <div className="grid min-w-0 gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-semibold">{r.playerName}</span>
                  {r.isViewer && <span className="bg-surface-2 text-ink-2 rounded-full px-2 py-0.5 text-xs">you</span>}
                  <PhaseBadge phase={r.phase} />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <CoinStack coins={r.coins} />
                  <span className="text-ink-3 text-xs">
                    {r.coins.map((c) => c.symbol).join(" ")}
                    {r.openSlots > 0 && (
                      <span className="text-gold">
                        {" "}
                        + {r.openSlots} waiting {r.openSlots === 1 ? "slot" : "slots"}
                      </span>
                    )}
                  </span>
                </div>
                <span className="text-ink-3 text-xs">In since {formatDay(r.startedOn)}</span>
              </div>

              <span className="hidden sm:block">
                <Sparkline values={r.spark} label={`${r.playerName}'s BTC multiple since the buy-in`} />
              </span>

              <div className="grid justify-items-end gap-0.5 text-right">
                {r.now == null ? (
                  <span className="text-ink-3 text-sm">Waiting for prices</span>
                ) : (
                  <>
                    <span
                      className={`font-display text-2xl sm:text-3xl ${r.now.multiple >= 1 ? "text-gradient-btc" : "text-gradient-loss"}`}
                    >
                      {formatMultiple(r.now.multiple)}
                    </span>
                    <Change value={r.now.multiple - 1} className="text-sm" />
                    <span className="text-ink-3 text-xs">
                      <Money btc={r.now.valueBtc} usd={r.now.valueUsd} />
                    </span>
                  </>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
