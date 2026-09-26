"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** A header link that marks the current page. */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const path = usePathname();
  const current = href === "/" ? path === "/" : path.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${current ? "bg-surface-2 text-ink" : "text-ink-2 hover:text-ink"}`}
    >
      {children}
    </Link>
  );
}
