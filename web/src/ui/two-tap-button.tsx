"use client";

import { useState, type ReactNode } from "react";
import { buttonClass } from "@/ui/button";

/** A button for something destructive: the first tap asks, the second does it. Tapping away
 *  cancels. `confirmLabel` should say what will be lost. */
export function TwoTapButton({
  children,
  confirmLabel,
  onConfirm,
  disabled = false,
}: {
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (!confirming) return setConfirming(true);
        setConfirming(false);
        onConfirm();
      }}
      onBlur={() => setConfirming(false)}
      className={buttonClass(confirming ? "danger" : "quiet", confirming ? "bg-loss/10" : "")}
    >
      {confirming ? confirmLabel : children}
    </button>
  );
}
