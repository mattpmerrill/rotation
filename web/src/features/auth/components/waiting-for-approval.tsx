"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { BitcoinSpinner } from "@/ui/bitcoin-spinner";

const EVERY_MS = 10_000;

/**
 * What someone sees between signing up and being approved. It checks again every few seconds while
 * the tab is visible (and right away when they come back to it), so approval shows up on its own
 * and nobody has to reload or ask.
 */
export function WaitingForApproval({ name }: { name: string }) {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(refresh, EVERY_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  return (
    <section className="grid max-w-xl gap-4" aria-live="polite">
      <BitcoinSpinner label="Waiting for approval" />
      <h1 className="text-3xl font-semibold">You’re in the queue, {name}</h1>
      <p className="text-ink-2">
        Matt has been told you’re here. As soon as he approves you, this page turns into the challenge: no need to
        reload or sign in again.
      </p>
      <p className="text-ink-3 text-sm">Signed up with the wrong account? Sign out (top right) and try again.</p>
    </section>
  );
}
