import "server-only";
import { listPeople } from "@/data/people.repository";
import { groupPeople, type Person } from "@/domain/people";
import type { Viewer } from "@/domain/viewer";

/** Everyone who has signed up, grouped for the admin page. Throws if the list can't be read: that
 *  is unexpected for an admin, and the page's error screen says so. */
export async function getPeople(): Promise<{ waiting: Person[]; members: Person[] }> {
  const result = await listPeople();
  if (!result.ok) throw new Error(`Could not list people: ${result.error.code}`);
  return groupPeople(result.data);
}

/** How many people are waiting for approval, for the badge in the admin's header. Zero for
 *  anyone who is not an admin: the list is the admin's alone. */
export async function countWaiting(viewer: Viewer): Promise<number> {
  if (!viewer.isAdmin) return 0;
  return (await getPeople()).waiting.length;
}
