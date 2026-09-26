"use client";

import { useMemo, useState } from "react";
import type { EligibleCoin } from "@/domain/basket";
import { RULES } from "@/domain/rules";

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
      <ul className="grid max-h-96 grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2" aria-label="Top 100 coins">
        {shown.map((c) => {
          const on = selected.includes(c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                aria-pressed={on}
                disabled={!on && full}
                onClick={() => onToggle(c.id)}
                className={`flex w-full items-center gap-3 rounded-[10px] border px-3 py-2 text-left text-sm transition-colors disabled:opacity-40 ${
                  on ? "border-btc bg-btc/10" : "hover:border-line hover:bg-surface-2 border-transparent"
                }`}
              >
                <span className="text-ink-3 w-8 shrink-0 text-xs">#{c.rank}</span>
                <span className="font-semibold">{c.symbol}</span>
                <span className="text-ink-3 truncate">{c.name}</span>
                <span aria-hidden className={`ml-auto text-lg leading-none ${on ? "text-btc" : "text-ink-3"}`}>
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
