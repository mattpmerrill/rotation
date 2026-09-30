# ui

Presentational components shared by more than one feature: buttons, fields, notices, the BTC/USD toggle, chart primitives (Recharts, with the shared series colors in `charts/theme.ts`), coin icons. Props in, markup out: no data fetching, no Server Actions, no business rules.

May import: `domain` and `lib`. Never `data`, `integrations`, `features` or `app`: pass data in as props.

The design system is the set of tokens in `app/globals.css` (`bg-surface`, `text-ink-2`, `text-btc`, ...) and the components here. The app is dark-only. A lint rule refuses literal colors, radii, shadows and z-indexes; a few files are on a ratchet list in `eslint.config.mjs` that may only shrink. The full kit ([ADR-002](../../../docs/decisions/ADR-002-design-kit.md)) is a recorded open exception.

Example, `unit.tsx`: `UnitProvider` remembers whether the person reads BTC or USD, and `Money` renders either from the two numbers a feature hands it.
