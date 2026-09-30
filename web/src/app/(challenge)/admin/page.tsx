import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireViewer } from "@/features/auth/viewer";
import { PeopleList } from "@/features/admin/components/people-list";
import { getPeople } from "@/features/admin/queries";

export const metadata: Metadata = { title: "People" };

/** Approve the friends who sign up. Admins only: anyone else gets the ordinary "not found". */
export default async function AdminPage() {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) notFound();
  const { waiting, members } = await getPeople();
  return (
    <>
      <section className="grid gap-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">People</h1>
        <p className="text-ink-2 max-w-2xl">
          Friends sign up on their own and wait here until you approve them. Approve someone and their screen switches
          to the challenge by itself.
        </p>
      </section>
      <PeopleList waiting={waiting} members={members} />
    </>
  );
}
