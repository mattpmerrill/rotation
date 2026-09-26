import { formatChange } from "@/lib/format";

/** A gain or loss: arrow + signed percent, colored, so it never relies on color alone. */
export function Change({ value, className = "" }: { value: number; className?: string }) {
  if (formatChange(value) === "0%") return <span className={`text-ink-2 font-semibold ${className}`}>0%</span>;
  const up = value >= 0;
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${up ? "text-gain" : "text-loss"} ${className}`}>
      <svg aria-hidden viewBox="0 0 10 10" className={`size-2.5 ${up ? "" : "rotate-180"}`}>
        <path d="M5 1 9 8H1z" fill="currentColor" />
      </svg>
      {formatChange(value)}
    </span>
  );
}
