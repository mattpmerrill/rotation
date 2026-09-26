import type { ReactNode } from "react";

type Tone = "info" | "error" | "success";

const tones: Record<Tone, string> = {
  info: "border-line bg-surface text-ink-2",
  error: "border-loss/40 bg-loss/10 text-ink",
  success: "border-gain/40 bg-gain/10 text-ink",
};

/** A message in the flow of the page: form errors, confirmations, explanations. */
export function Notice({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}
