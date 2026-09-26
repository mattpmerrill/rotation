import type { ReactNode } from "react";

/** The hover card every chart uses: a title and label/value rows with a color key. */
export function ChartTooltip({
  title,
  rows,
}: {
  title: ReactNode;
  rows: { label: string; value: ReactNode; color?: string }[];
}) {
  return (
    <div className="border-line bg-surface-2 grid min-w-44 gap-1.5 rounded-xl border px-3 py-2.5 text-sm shadow-lg shadow-black/40">
      <div className="text-ink-3 text-xs">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4">
          <span className="text-ink-2 flex items-center gap-2">
            {r.color && <span aria-hidden className="size-2.5 rounded-sm" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="font-semibold">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
