import Link from "next/link";
import type { Coin } from "@/domain/types";
import { buttonClass } from "@/ui/button";
import { CoinStack } from "@/ui/coin-stack";
import { CycleCard } from "@/ui/cycle-card";
import type { PickView } from "../queries";

const ACCENT: Record<PickView["accent"], { color: string; wash: string; ring: string }> = {
  gold: { color: "var(--gold)", wash: "rgb(255 194 71 / 0.14)", ring: "border-gold/40" },
  violet: { color: "var(--accent-violet)", wash: "rgb(144 133 233 / 0.16)", ring: "border-accent-violet/40" },
  blue: { color: "var(--accent-blue)", wash: "rgb(57 135 229 / 0.16)", ring: "border-accent-blue/40" },
  aqua: { color: "var(--accent-aqua)", wash: "rgb(31 181 132 / 0.14)", ring: "border-accent-aqua/40" },
  magenta: { color: "var(--accent-magenta)", wash: "rgb(224 103 154 / 0.14)", ring: "border-accent-magenta/40" },
};

/** One pick: the idea, both cycles, and why it worked. */
export function PickCard({ pick, coins, rank }: { pick: PickView; coins: Record<string, Coin>; rank: number }) {
  const a = ACCENT[pick.accent];
  const meta = pick.basket.map((id) => coins[id] ?? { id, symbol: id.toUpperCase(), name: id, image: null });
  return (
    <article
      className={`panel grid gap-6 overflow-hidden p-5 sm:p-7 ${a.ring}`}
      style={{ backgroundImage: `linear-gradient(135deg, ${a.wash}, transparent 45%)` }}
      aria-labelledby={`pick-${pick.slug}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-2">
          <span className="text-sm font-semibold" style={{ color: a.color }}>
            Pick {rank}
          </span>
          <h2 id={`pick-${pick.slug}`} className="font-display text-2xl font-semibold tracking-tight">
            {pick.title}
          </h2>
          <p className="text-ink-2 max-w-2xl">{pick.summary}</p>
        </div>
        <div className="grid justify-items-end gap-3">
          <CoinStack coins={meta} size={36} />
          <span className="text-sm font-semibold">{meta.map((c) => c.symbol).join(" · ")}</span>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-2">
        {pick.cycles.map((c) => (
          <CycleCard key={c.label} cycle={c} coins={coins} color={a.color} />
        ))}
      </div>

      <div className="grid gap-2">
        <h3 className="font-semibold">What happened</h3>
        <ul className="text-ink-2 grid gap-2">
          {pick.why.map((w) => (
            <li key={w} className="flex gap-3">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full" style={{ background: a.color }} />
              {w}
            </li>
          ))}
        </ul>
      </div>

      <Link href={`/pick?basket=${pick.basket.join(",")}`} className={buttonClass("quiet", "w-fit")}>
        Try this basket
      </Link>
    </article>
  );
}
