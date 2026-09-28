"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CyclePreview } from "@/domain/preview";
import { formatBtc, formatDay, formatMonth } from "@/lib/format";
import { ChartTooltip } from "./ChartTooltip";
import { AXIS, GRID, SERIES } from "./theme";

/** One past cycle: 1 BTC in the basket, in BTC, week by week, with the old sell window shaded. */
export function BasketHistoryChart({
  cycle,
  color = SERIES.line,
}: {
  cycle: CyclePreview;
  color?: string | undefined;
}) {
  return (
    <div className="h-48" role="img" aria-label={`The basket in BTC, ${cycle.label}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={cycle.points} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="week" tickFormatter={(d: string) => formatMonth(d)} minTickGap={40} {...AXIS} />
          <YAxis
            width={40}
            scale="log"
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => `${v.toFixed(v < 2 ? 1 : 0)}`}
            {...AXIS}
            axisLine={false}
            allowDataOverflow
          />
          {cycle.sellWindowWeeks && (
            <ReferenceArea
              x1={cycle.sellWindowWeeks[0]}
              x2={cycle.sellWindowWeeks[1]}
              fill="var(--gold)"
              fillOpacity={0.15}
            />
          )}
          <ReferenceLine y={1} stroke="var(--ink-3)" strokeDasharray="4 4" />
          <Tooltip
            cursor={{ stroke: "var(--ink-3)" }}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as { week: string; btc: number } | undefined;
              if (!active || !point) return null;
              return (
                <ChartTooltip
                  title={`Week of ${formatDay(point.week)}`}
                  rows={[{ label: "Basket", value: formatBtc(point.btc, 2), color }]}
                />
              );
            }}
          />
          <Line dataKey="btc" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
