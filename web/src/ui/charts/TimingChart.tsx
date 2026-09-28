"use client";

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Stretch, TimingPoint } from "@/domain/timing";
import { formatBtc, formatDay } from "@/lib/format";
import { ChartTooltip } from "./ChartTooltip";
import { Legend } from "./Legend";
import { AXIS, GRID } from "./theme";

/** One color per cycle, the same on every chart (dataviz validator, all pairs, dark surface). */
const CYCLE_COLOR: Record<number, string> = { 2016: "#3987e5", 2020: "#d95926", 2024: "#199e70" };
const colorOf = (cycle: number) => CYCLE_COLOR[cycle] ?? "var(--ink-2)";

/**
 * BTC per BTC by how many days after the halving the alts were bought, one line per cycle.
 * Stretches that beat BTC in most cycles are shaded; today is marked.
 */
export function TimingChart({
  points,
  stretches,
  today,
}: {
  points: TimingPoint[];
  stretches: Stretch[];
  today: number;
}) {
  const cycles = [...new Set(points.map((p) => p.cycle))].sort();
  const good = stretches.filter((s) => s.stance.of >= 2 && s.stance.wins / s.stance.of > 0.5);
  return (
    <div className="grid gap-3">
      <Legend
        items={[
          ...cycles.map((c) => ({ label: `Bought in the ${c} cycle`, color: colorOf(c) })),
          { label: "Today", color: "var(--gold)", dashed: true },
        ]}
      />
      <div className="h-72 sm:h-96" role="img" aria-label="Result of buying alts by day in the cycle, per past cycle">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
            <CartesianGrid {...GRID} />
            {good.map((s) => (
              <ReferenceArea key={s.from} x1={s.from} x2={s.to} fill="var(--gain)" fillOpacity={0.08} />
            ))}
            <XAxis
              type="number"
              dataKey="day"
              domain={[0, 1456]}
              ticks={[0, 180, 365, 540, 730, 910, 1095, 1275, 1456]}
              tickFormatter={(d: number) => (d === 0 ? "Halving" : `${Math.round(d / 30.4)} mo`)}
              {...AXIS}
            />
            <YAxis
              type="number"
              dataKey="btc"
              scale="log"
              domain={[0.2, "auto"]}
              allowDataOverflow
              width={44}
              tickFormatter={(v: number) => `${v < 1 ? v.toFixed(1) : v.toFixed(0)}×`}
              {...AXIS}
              axisLine={false}
            />
            <ReferenceLine y={1} stroke="var(--ink-3)" strokeDasharray="4 4" />
            <ReferenceLine x={today} stroke="var(--gold)" strokeDasharray="5 4" strokeWidth={2} />
            <Tooltip
              cursor={{ stroke: "var(--ink-3)" }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as TimingPoint | undefined;
                if (!active || !p) return null;
                return (
                  <ChartTooltip
                    title={`Bought ${formatDay(p.entry)}, day ${p.day}`}
                    rows={[
                      {
                        label: "At the next sell window",
                        value: formatBtc(p.btc, 2),
                        color: colorOf(p.cycle),
                      },
                    ]}
                  />
                );
              }}
            />
            {cycles.map((c) => (
              <Line
                key={c}
                data={points.filter((p) => p.cycle === c)}
                dataKey="btc"
                stroke={colorOf(c)}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="text-ink-3 text-xs">
        Green bands: stretches where buying beat holding BTC in most past cycles. Dashed line: 1 BTC. Log scale.
      </p>
    </div>
  );
}
