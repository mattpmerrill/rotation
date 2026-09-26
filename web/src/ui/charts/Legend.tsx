/** A chart legend: color key + name for each series. */
export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="text-ink-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2">
          {i.dashed ? (
            <span aria-hidden className="w-4 border-t-2 border-dashed" style={{ borderColor: i.color }} />
          ) : (
            <span aria-hidden className="size-2.5 rounded-sm" style={{ background: i.color }} />
          )}
          {i.label}
        </li>
      ))}
    </ul>
  );
}
