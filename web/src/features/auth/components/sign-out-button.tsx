import { signOut } from "../actions";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button className="text-ink-3 hover:text-ink text-sm font-semibold">Sign out</button>
    </form>
  );
}
