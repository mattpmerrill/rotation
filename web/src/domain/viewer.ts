/** The signed-in person as the app sees them: who they are and what they may do. */
export interface Viewer {
  id: string;
  email: string;
  name: string;
  /** Approved by an admin: may see and join the challenge. */
  isMember: boolean;
  /** May approve people and see the admin page. */
  isAdmin: boolean;
}
