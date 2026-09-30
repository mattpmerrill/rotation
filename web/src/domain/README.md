# domain

The challenge's rules and money math, as pure TypeScript: types and vocabulary (`types.ts`), valuation, standings, the buy-in plan, waiting slots, the timing verdict, the past-cycle preview. No React, no Next, no Supabase, no I/O, so every rule is unit-tested in isolation (`*.test.ts` next to the code, shared data in `fixtures.ts`, which only tests import).

May import: other `domain` modules and `lib`. Nothing else (ESLint and dependency-cruiser both enforce it).

The fairness rules (1 BTC cap, basket size, no overselling, slot shares) are enforced by the database and mirrored here so a person gets a message they can act on. `rules.ts` names the migration; change the two together.

Example, `buy-in.ts`: `planBuyIn` turns 1 BTC and a basket into the trades of an equal-dollar buy-in, `draftBuyIn` applies what a person typed over that plan, and `checkBuyIn` says in words what the database would refuse.
