"use client";

import { useRouter } from "next/navigation";
import type { Coin } from "@/domain/types";
import { CoinIcon } from "@/ui/CoinIcon";

/** Pick a coin to see its own timing; the choice lives in the URL (?coin=). */
export function CoinChooser({ coins, selected }: { coins: Coin[]; selected: Coin | null }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-3">
      {selected && <CoinIcon symbol={selected.symbol} image={selected.image} size={32} />}
      <label htmlFor="timing-coin" className="sr-only">
        Coin
      </label>
      <select
        id="timing-coin"
        className="field max-w-xs"
        value={selected?.id ?? ""}
        onChange={(e) => router.push(e.target.value ? `/timing?coin=${e.target.value}` : "/timing", { scroll: false })}
      >
        <option value="">Choose a coin…</option>
        {[...coins]
          .sort((a, b) => a.symbol.localeCompare(b.symbol))
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.symbol}: {c.name}
            </option>
          ))}
      </select>
    </div>
  );
}
