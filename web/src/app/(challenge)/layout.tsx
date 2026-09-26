import Link from "next/link";
import { requireViewer } from "@/data/viewer";
import { SignOutButton } from "@/features/auth/components/SignOutButton";
import { getMyEntryId } from "@/features/entry/queries";
import { NavLink } from "@/ui/NavLink";
import { UnitToggle } from "@/ui/unit";
import { Wordmark } from "@/ui/Wordmark";

/** The signed-in app: header, then the page. Non-members see how to get in instead. */
export default async function ChallengeLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  const myEntryId = viewer.isMember ? await getMyEntryId(viewer) : null;

  return (
    <>
      <header className="border-line bg-bg/75 sticky top-0 z-10 border-b backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" aria-label="1 Bitty Challenge: leaderboard">
            <Wordmark />
          </Link>
          {viewer.isMember && (
            <nav
              className="order-last -mx-1 flex w-full items-center gap-1 overflow-x-auto px-1 sm:order-none sm:w-auto"
              aria-label="Main"
            >
              <NavLink href="/">Leaderboard</NavLink>
              {myEntryId ? (
                <NavLink href={`/entries/${myEntryId}`}>My basket</NavLink>
              ) : (
                <NavLink href="/pick">Pick a basket</NavLink>
              )}
              <NavLink href="/picks">Joi’s top picks</NavLink>
            </nav>
          )}
          <div className="ml-auto flex items-center gap-4">
            <UnitToggle />
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-5xl gap-10 px-4 py-8 sm:py-12">
        {viewer.isMember ? (
          children
        ) : (
          <section className="grid max-w-xl gap-3">
            <h1 className="text-3xl font-semibold">You’re signed in, but not in the challenge yet</h1>
            <p className="text-ink-2">
              The challenge is invite-only. Ask Matt to add{" "}
              <span className="text-ink font-semibold">{viewer.email}</span>, then reload this page.
            </p>
          </section>
        )}
      </main>
    </>
  );
}
