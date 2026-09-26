import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/data/viewer";
import { LoginForm } from "@/features/auth/components/LoginForm";
import { Wordmark } from "@/ui/Wordmark";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getViewer()) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-sm content-center gap-8 px-4 py-12">
      <div className="grid gap-4">
        <Wordmark className="text-5xl" />
        <h1 className="text-2xl font-semibold">How many BTC can you get from one?</h1>
        <p className="text-ink-2">
          Swap up to 1 BTC into a basket of alts, sell near the top, rebuy BTC in the bear. Most BTC at the end wins.
        </p>
      </div>
      <LoginForm linkError={error} />
    </main>
  );
}
