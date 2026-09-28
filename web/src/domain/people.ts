/** Someone who has signed up, as the admin sees them. Pure data: no framework, no I/O. */
export interface Person {
  id: string;
  email: string;
  name: string;
  isMember: boolean;
  isAdmin: boolean;
  /** When they signed up (ISO timestamp). */
  signedUpAt: string;
  /** How they sign in: "email" or "google". */
  provider: string;
}

/** Who is waiting for approval, who is in, oldest waiting first. Admins are listed with the members. */
export function groupPeople(people: Person[]): { waiting: Person[]; members: Person[] } {
  const waiting = people.filter((p) => !p.isMember).sort((a, b) => a.signedUpAt.localeCompare(b.signedUpAt));
  const members = people
    .filter((p) => p.isMember)
    .sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) || a.name.localeCompare(b.name));
  return { waiting, members };
}

/** A name that is safe to put in a Discord message: no formatting characters, no mentions, no
 *  links, and not too long. People choose their own name, so it is treated as untrusted. */
export function plainName(name: string): string {
  const cleaned = name
    .replace(/[*_~`>|@#[\]()\\<]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "Someone").slice(0, 40);
}

/** The Discord post that tells the admin someone is waiting. Names only: never an email address. */
export function waitingMessage(name: string, adminUrl: string): string {
  return `**${plainName(name)}** signed up and is waiting for approval: ${adminUrl}`;
}
