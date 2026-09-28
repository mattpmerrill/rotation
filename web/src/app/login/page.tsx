import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/data/viewer";
import { LoginForm } from "@/features/auth/components/LoginForm";

export const metadata: Metadata = { title: "Sign in" };

const STEPS = [
  { n: "01", title: "Swap up to 1 BTC", body: "Into 2 to 8 top-100 alts." },
  { n: "02", title: "Ride the bull", body: "Sell near the top for USDT." },
  { n: "03", title: "Rebuy the bear", body: "Most BTC at the end wins." },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getViewer()) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-5xl items-center gap-10 px-5 py-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
      {/* The pitch */}
      <section className="login-rise grid gap-7">
        <HeroCoin />
        <div className="grid gap-4">
          <p className="text-gold text-xs font-semibold tracking-[0.25em] uppercase">Invite only · Scored in BTC</p>
          <h1 className="font-display text-5xl leading-[1.02] font-semibold tracking-tight sm:text-6xl">
            1 Bitty
            <br />
            <span className="text-gradient-btc">Challenge</span>
          </h1>
          <p className="text-ink-2 max-w-md text-lg">How many BTC can you get from one?</p>
        </div>
        <ol className="hidden gap-4 sm:grid sm:grid-cols-3 lg:max-w-lg">
          {STEPS.map((s) => (
            <li key={s.n} className="border-line grid content-start gap-1 border-t pt-3">
              <span className="text-btc font-display text-xs font-semibold">{s.n}</span>
              <span className="text-sm font-semibold">{s.title}</span>
              <span className="text-ink-3 text-xs">{s.body}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* The card */}
      <section className="login-rise login-rise-2 panel login-card relative grid gap-6 p-6 sm:p-8">
        <span aria-hidden className="login-card-edge" />
        <div className="grid gap-1">
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="text-ink-3 text-sm">See the leaderboard and your basket.</p>
        </div>
        <LoginForm linkError={error} />
        <p className="text-ink-3 border-line border-t pt-4 text-xs">
          New players need an invite from Matt. Not financial advice, just a friendly scoreboard.
        </p>
      </section>
    </main>
  );
}

/** A floating gold "1" coin in two orbit rings: the brand mark, big. */
function HeroCoin() {
  return (
    <div aria-hidden className="login-coin-wrap">
      <span className="login-orbit" />
      <span className="login-orbit login-orbit-2" />
      <span className="login-coin font-display">1</span>
    </div>
  );
}
