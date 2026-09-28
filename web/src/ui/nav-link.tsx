"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** A header link that marks the current page. */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const path = usePathname();
  const current = path === href || (href !== "/" && path.startsWith(`${href}/`));
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors ${
        current ? "bg-btc/15 text-gold ring-btc/40 ring-1" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
