"use client";

import { useState, useTransition } from "react";
import { removeTrade } from "../actions";

/** Two taps to delete: the first asks, the second deletes. */
export function DeleteTradeButton({ tradeId }: { tradeId: number }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  if (error) return <span className="text-loss text-xs">{error}</span>;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirming) return setConfirming(true);
        start(async () => {
          const r = await removeTrade(tradeId);
          if (r.error) setError(r.error);
          setConfirming(false);
        });
      }}
      onBlur={() => setConfirming(false)}
      className={`text-xs font-semibold ${confirming ? "text-loss" : "text-ink-3 hover:text-ink"}`}
    >
      {pending ? "Deleting…" : confirming ? "Tap again to delete" : "Delete"}
    </button>
  );
}
