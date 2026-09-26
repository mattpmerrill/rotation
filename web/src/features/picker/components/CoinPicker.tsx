"use client";

import { useMemo, useState } from "react";
import type { EligibleCoin } from "@/domain/basket";
import { RULES } from "@/domain/rules";
import { CoinIcon } from "@/ui/CoinIcon";

/** Search today's top 100 and tap to add or remove coins (up to 8). */
export function CoinPicker({
  coins,
  selected,
  onToggle,
}: {
  coins: EligibleCoin[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? coins.filter((c) => c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)) : coins;
  }, [coins, query]);
  const full = selected.length >= RULES.basketMax;

  return (
    <div className="grid gap-3">
      <input
        type="search"
        className="field"
        placeholder="Search by name or ticker"
        aria-label="Search coins"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul
        className="grid max-h-[28rem] grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3"
        aria-label="Top 100 coins"
      >
        {shown.map((c) => {
          const on = selected.includes(c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                aria-pressed={on}
                disabled={!on && full}
                onClick={() => onToggle(c.id)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition disabled:opacity-40 ${
                  on
                    ? "border-btc bg-btc/15 shadow-[0_0_20px_-10px_var(--btc)]"
                    : "border-line/60 bg-surface/60 hover:border-ink-3 hover:bg-surface-2"
                }`}
              >
                <span className="text-ink-3 w-7 shrink-0 text-xs">#{c.rank}</span>
                <CoinIcon symbol={c.symbol} image={c.image} size={26} />
                <span className="font-semibold">{c.symbol}</span>
                <span className="text-ink-3 truncate">{c.name}</span>
                <span
                  aria-hidden
                  className={`ml-auto grid size-6 shrink-0 place-items-center rounded-full text-sm leading-none ${on ? "bg-btc text-bg" : "text-ink-3 ring-line ring-1"}`}
                >
                  {on ? "✓" : "+"}
                </span>
              </button>
            </li>
          );
        })}
        {shown.length === 0 && (
          <li className="text-ink-3 px-3 py-6 text-sm">No coin in the top 100 matches “{query}”.</li>
        )}
      </ul>
    </div>
  );
}
