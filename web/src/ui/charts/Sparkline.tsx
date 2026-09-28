import { defined } from "@/lib/defined";
/** A tiny line of an entry's BTC multiple over time, with the 1.0 start level dashed. */
export function Sparkline({
  values,
  label,
  width = 112,
  height = 36,
}: {
  values: number[];
  label: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return <span className="inline-block" style={{ width, height }} aria-hidden />;
  const lo = Math.min(1, ...values);
  const hi = Math.max(1, ...values);
  const pad = 3;
  const y = (v: number) => pad + (height - 2 * pad) * (1 - (v - lo) / (hi - lo || 1));
  const x = (i: number) => pad + ((width - 2 * pad) * i) / (values.length - 1);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const last = defined(values.at(-1), "the last value");
  return (
    <svg
      role="img"
      aria-label={label}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      <line x1={pad} x2={width - pad} y1={y(1)} y2={y(1)} stroke="var(--line)" strokeDasharray="3 3" />
      <path d={d} fill="none" stroke="var(--ink-2)" strokeWidth={1.5} strokeLinejoin="round" />
      <circle
        cx={x(values.length - 1)}
        cy={y(last)}
        r={3}
        fill={last >= 1 ? "var(--gain)" : "var(--loss)"}
        stroke="var(--surface)"
        strokeWidth={2}
      />
    </svg>
  );
}
