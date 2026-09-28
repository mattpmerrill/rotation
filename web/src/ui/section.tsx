import type { ReactNode } from "react";

/** A titled block of the page. Panels are for content that needs a frame (charts, forms). */
export function Section({
  title,
  action,
  children,
  panel = false,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  panel?: boolean;
}) {
  return (
    <section className="grid gap-4">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {panel ? <div className="border-line bg-surface rounded-2xl border p-4 sm:p-5">{children}</div> : children}
    </section>
  );
}
