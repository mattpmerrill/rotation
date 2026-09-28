import type { InputHTMLAttributes, ReactNode } from "react";

/** A labelled input with an optional hint and error. */
export function Field({
  label,
  hint,
  error,
  id,
  className = "",
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode; error?: string; id: string }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`grid gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-ink-2 text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        className="field"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...input}
      />
      {error ? (
        <p id={`${id}-error`} className="text-loss text-sm">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-ink-3 text-sm">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
