import type { Stance } from "@/domain/timing";
import { formatBtc } from "@/lib/format";

const TONE = {
  good: { label: "A good time to buy", text: "text-gain", ring: "border-gain/50", wash: "rgb(61 220 151 / 0.14)" },
  mixed: { label: "A mixed time to buy", text: "text-gold", ring: "border-gold/50", wash: "rgb(255 194 71 / 0.12)" },
  poor: { label: "A poor time to buy", text: "text-loss", ring: "border-loss/50", wash: "rgb(255 107 107 / 0.12)" },
  unknown: { label: "Not enough history", text: "text-ink-2", ring: "border-line", wash: "transparent" },
} as const;

/** The indicator: how buying at this point in the cycle went before, in one line and a number per cycle. */
export function TimingVerdict({ stance, day, subject }: { stance: Stance; day: number; subject: string }) {
  const kind =
    stance.of < 2 ? "unknown" : stance.wins === 0 ? "poor" : stance.wins / stance.of > 0.5 ? "good" : "mixed";
  const t = TONE[kind];
  return (
    <div
      className={`panel grid gap-4 p-5 sm:p-6 ${t.ring}`}
      style={{ backgroundImage: `linear-gradient(120deg, ${t.wash}, transparent 60%)` }}
    >
      <div className="grid gap-1">
        <span className="text-ink-3 text-sm">
          Buying {subject} now, day {day} after the halving: historically
        </span>
        <span className={`font-display text-2xl font-semibold tracking-tight sm:text-3xl ${t.text}`}>{t.label}</span>
        {stance.of > 0 && (
          <span className="text-ink-2">
            Beat holding BTC in {stance.wins} of {stance.of} past {stance.of === 1 ? "cycle" : "cycles"}.
          </span>
        )}
      </div>
      {stance.byCycle.length > 0 && (
        <dl className="flex flex-wrap gap-2">
          {stance.byCycle.map((c) => (
            <div key={c.cycle} className="bg-bg/40 border-line rounded-xl border px-3 py-2">
              <dt className="text-ink-3 text-xs">Bought around now in the {c.cycle} cycle</dt>
              <dd className={`font-semibold ${c.btc >= 1 ? "text-gain" : "text-loss"}`}>{formatBtc(c.btc, 2)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
