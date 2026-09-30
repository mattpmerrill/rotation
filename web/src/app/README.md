# app

Routes only: pages, layouts, route handlers, `loading`/`error`/`not-found` files, and the design tokens in `globals.css`. A route checks access, calls one feature query or action, and composes components. No business logic here, and no direct data or vendor access.

May import: `features`, `ui`, `domain`, `lib`. Never `data` or `integrations` (ESLint and dependency-cruiser both refuse it). The session reaches a route through `features/auth/viewer`.

Example, `app/(challenge)/entries/[id]/page.tsx`: `requireViewer()`, `getEntryView(id, viewer)` from `features/entry`, then render the entry's components. Sums, flags and copy decisions come back from the query; the page only lays them out.

`src/proxy.ts` (next to this folder) follows the same rule: it gives each page request a Content-Security-Policy with a fresh nonce and refreshes the auth session, through `features/security` and `features/auth`. It is not the authorization boundary; every page and action checks again.
