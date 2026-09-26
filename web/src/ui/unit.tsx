"use client";

import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react";
import { formatBtc, formatUsd } from "@/lib/format";

/**
 * BTC or USD: how amounts are shown. BTC by default (the challenge is scored in BTC); the
 * choice is remembered per browser. Amounts come in both units, so switching is instant.
 */
export type Unit = "btc" | "usd";

const KEY = "unit";
const listeners = new Set<() => void>();

function read(): Unit {
  try {
    return localStorage.getItem(KEY) === "usd" ? "usd" : "btc";
  } catch {
    return "btc";
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const UnitContext = createContext<{ unit: Unit; setUnit: (u: Unit) => void }>({ unit: "btc", setUnit: () => {} });

export function UnitProvider({ children }: { children: ReactNode }) {
  const unit = useSyncExternalStore(subscribe, read, () => "btc" as Unit);
  const setUnit = useCallback((u: Unit) => {
    try {
      localStorage.setItem(KEY, u);
    } catch {
      // storage blocked: the choice lasts for this page only
    }
    listeners.forEach((fn) => fn());
  }, []);
  return <UnitContext value={{ unit, setUnit }}>{children}</UnitContext>;
}

export const useUnit = () => useContext(UnitContext);

export function UnitToggle() {
  const { unit, setUnit } = useUnit();
  return (
    <div
      role="radiogroup"
      aria-label="Show amounts in"
      className="border-line bg-surface inline-flex rounded-full border p-0.5 text-xs font-semibold"
    >
      {(["btc", "usd"] as const).map((u) => (
        <button
          key={u}
          role="radio"
          aria-checked={unit === u}
          onClick={() => setUnit(u)}
          className={`rounded-full px-3 py-1.5 transition-colors ${unit === u ? "bg-btc text-bg" : "text-ink-2 hover:text-ink"}`}
        >
          {u.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/** An amount in the chosen unit. */
export function Money({ btc, usd, places }: { btc: number; usd: number; places?: number }) {
  const { unit } = useUnit();
  return <>{unit === "btc" ? formatBtc(btc, places) : formatUsd(usd)}</>;
}
