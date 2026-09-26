import Link from "next/link";
import { buttonClass } from "@/ui/Button";

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-4 px-4">
      <h1 className="text-3xl font-semibold">That page isn’t here</h1>
      <p className="text-ink-2">The link may be old, or that basket belongs to a finished challenge.</p>
      <Link href="/" className={buttonClass("quiet", "w-fit")}>
        Back to the leaderboard
      </Link>
    </main>
  );
}
