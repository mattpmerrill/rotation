"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ValuePoint } from "@/domain/valuation";
import { daysBetween } from "@/lib/days";
import { formatBtc, formatDay, formatMonth, formatUsd } from "@/lib/format";
import { ChartTooltip } from "@/ui/charts/ChartTooltip";
import { Legend } from "@/ui/charts/Legend";
import { AXIS, GRID, SERIES } from "@/ui/charts/theme";
import { useUnit } from "@/ui/unit";

const LAYERS = [
  { key: "alts", label: "Alts", color: SERIES.alts },
  { key: "usdt", label: "USDT", color: SERIES.usdt },
  { key: "btc", label: "BTC", color: SERIES.btc },
] as const;

/** What the entry holds over time, stacked, in the chosen unit, against simply holding the BTC. */
export function ValueChart({ series, btcIn }: { series: ValuePoint[]; btcIn: number }) {
  const { unit } = useUnit();
  const inBtc = unit === "btc";
  const fmt = (v: number) => (inBtc ? formatBtc(v, 3) : formatUsd(v));
  const data = series.map((p) => ({
    day: p.day,
    alts: inBtc ? p.altsUsd / p.btcPrice : p.altsUsd,
    usdt: inBtc ? p.usdt / p.btcPrice : p.usdt,
    btc: inBtc ? p.btcQty : p.btcQty * p.btcPrice,
    total: inBtc ? p.totalBtc : p.totalUsd,
    held: inBtc ? btcIn : btcIn * p.btcPrice,
  }));
  // under ~6 months, label days ("Aug 20"); longer, label months
  const shortSpan = series.length > 1 && daysBetween(series[0].day, series.at(-1)!.day) < 180;
  const layers = LAYERS.filter((l) => data.some((d) => Math.abs(d[l.key]) > 1e-9));

  if (data.length < 2) {
    return (
      <p className="text-ink-3 py-10 text-center text-sm">The chart fills in after the first full day of prices.</p>
    );
  }
  return (
    <div className="grid gap-3">
      <Legend items={[...layers, { label: "Just holding the BTC", color: "var(--gold)", dashed: true }]} />
      <div
        className="h-64 sm:h-80"
        role="img"
        aria-label={`Value over time in ${unit.toUpperCase()}, by what is held, against holding BTC`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid {...GRID} />
            <XAxis
              dataKey="day"
              tickFormatter={(d: string) => (shortSpan ? formatDay(d, { year: false }) : formatMonth(d))}
              minTickGap={48}
              {...AXIS}
            />
            <YAxis
              width={inBtc ? 56 : 72}
              tickFormatter={(v: number) => (inBtc ? v.toFixed(2) : `$${Math.round(v / 1000)}k`)}
              {...AXIS}
              axisLine={false}
            />
            <Tooltip
              cursor={{ stroke: "var(--ink-3)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof data)[number];
                return (
                  <ChartTooltip
                    title={formatDay(d.day)}
                    rows={[
                      ...layers.map((l) => ({ label: l.label, value: fmt(d[l.key]), color: l.color })),
                      { label: "Total", value: fmt(d.total) },
                      { label: "Just holding", value: fmt(d.held), color: "var(--gold)" },
                    ]}
                  />
                );
              }}
            />
            {layers.map((l) => (
              <Area
                key={l.key}
                dataKey={l.key}
                stackId="value"
                type="linear"
                fill={l.color}
                fillOpacity={0.85}
                stroke="var(--surface)"
                strokeWidth={2}
                isAnimationActive={false}
              />
            ))}
            <Line
              dataKey="held"
              stroke="var(--gold)"
              strokeDasharray="5 4"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
