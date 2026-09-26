import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "quiet" | "danger";

const styles: Record<Variant, string> = {
  primary: "bg-btc text-bg hover:bg-gold disabled:bg-surface-2 disabled:text-ink-3",
  quiet: "border border-line bg-surface text-ink hover:border-ink-3 disabled:text-ink-3",
  danger: "border border-loss/40 text-loss hover:bg-loss/10",
};

export function buttonClass(variant: Variant = "primary", extra = "") {
  return `inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${styles[variant]} ${extra}`;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}
