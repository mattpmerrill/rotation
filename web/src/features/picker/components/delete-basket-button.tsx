"use client";

import { BitcoinSpinner } from "@/ui/bitcoin-spinner";
import { useState, useTransition } from "react";
import { buttonClass } from "@/ui/button";
import { removeBasket } from "../actions";

/** Two taps to delete a basket: the first asks, the second deletes it and every trade in it. */
export function DeleteBasketButton({ entryId }: { entryId: number }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirming) return setConfirming(true);
          start(async () => {
            const r = await removeBasket(entryId);
            if (r?.error) setError(r.error);
            setConfirming(false);
          });
        }}
        onBlur={() => setConfirming(false)}
        className={buttonClass(confirming ? "danger" : "quiet", confirming ? "bg-loss/10" : "")}
      >
        {pending && <BitcoinSpinner size="sm" label="Deleting" />}
        {pending ? "Deleting…" : confirming ? "Tap again to delete for good" : "Delete basket"}
      </button>
      {error && <span className="text-loss text-sm">{error}</span>}
    </span>
  );
}
