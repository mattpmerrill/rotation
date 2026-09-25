import type { Metadata } from "next";
import Link from "next/link";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Condensed } from "next/font/google";
import { currentUser } from "@/lib/supabase/server";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans" });
const condensed = IBM_Plex_Sans_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-plex-condensed" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: "Rotation",
  description: "Hold more BTC every cycle: the cycle clock, your plan and your stack.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en" className={`${sans.variable} ${condensed.variable} ${mono.variable}`}>
      <body className="min-h-dvh">
        <header className="border-b border-rule bg-surface">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm">
            <Link href="/" className="font-display text-lg font-bold tracking-tight">
              Rotation<span className="text-btc">.</span>
            </Link>
            <Link href="/" className="text-ink-2 hover:text-ink">Cycle clock</Link>
            <a href="/explorer.html#lab" className="text-ink-2 hover:text-ink">Basket Lab</a>
            {user && <Link href="/plan" className="text-ink-2 hover:text-ink">My plan</Link>}
            {user && <Link href="/stack" className="text-ink-2 hover:text-ink">My stack</Link>}
            <span className="ml-auto" />
            {user ? (
              <form action="/auth/signout" method="post" className="flex items-center gap-3">
                <span className="hidden text-ink-3 sm:inline">{user.email}</span>
                <button className="btn btn-quiet">Sign out</button>
              </form>
            ) : (
              <Link href="/login" className="btn btn-primary">Sign in</Link>
            )}
          </nav>
        </header>
        <main className="mx-auto grid max-w-5xl gap-8 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
