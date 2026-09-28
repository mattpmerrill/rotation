"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

const EVERY_MS = 60_000;

/**
 * Keeps a server-rendered page current: re-fetches it every minute while the tab is visible,
 * and right away when you come back to it. Shows when the prices were quoted.
 */
export function LiveRefresh({ liveAt }: { liveAt: number | null }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") startRefresh(() => router.refresh());
    };
    const timer = setInterval(refresh, EVERY_MS);
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  if (liveAt == null) {
    return <span className="text-ink-3 text-xs">Daily closes · live prices unavailable</span>;
  }
  return (
    <span className="text-ink-3 inline-flex items-center gap-2 text-xs" aria-live="polite">
      <span className={`live-dot ${refreshing ? "live-dot-busy" : ""}`} aria-hidden />
      <span>
        <span className="text-gain font-semibold">Live</span> · {refreshing ? "updating…" : ago(now - liveAt)}
      </span>
    </span>
  );
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} hr ago`;
}
