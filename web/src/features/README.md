# features

One folder per capability: `auth`, `admin`, `entry`, `leaderboard`, `notifications`, `picker`, `picks`, `timing`, `trades`, `security`, `health`. Inside a feature, by convention:

- `queries.ts`: what a page reads. Returns a view that is ready to render.
- `actions.ts`: Server Actions. Transport only: `requireMember()`, parse the form with `schema.ts`, call one service, turn its result into what the form shows.
- `service.ts`: the use case. Checks the domain rules, then asks a repository to write. Returns an `ApplicationResult`.
- `schema.ts`: Zod schemas for input from outside the trust boundary.
- `components/`: React components for this feature. Props in, markup out; they call actions, never data.

May import: `data`, `integrations`, `ui`, `domain`, `lib`. A feature never imports another feature (ESLint refuses `@/features/*`); `app/` composes them, and anything two features need moves down a layer.

Example, `features/trades`: `actions.ts` validates the form and calls `service.ts`, which checks the sale against the balances with `domain/trades` and then calls `data/trades.repository`.
