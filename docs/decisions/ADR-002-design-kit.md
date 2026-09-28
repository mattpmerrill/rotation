# ADR-002: Keep Next.js; add shadcn/ui and Motion for the interface

- **Status**: Accepted
- **Date**: 2026-09-28
- **Owner**: Matt Merrill

## Context

The app should be pleasant to use and visually polished, and it should be a credible showcase of
modern web engineering. The question was whether the current framework is the right base or
whether a rewrite is worth doing while the project is small.

Current base (versions as of 2026-09-28): Next.js 16.3 (App Router), React 19.2, Tailwind 4,
Supabase Auth and Postgres, Zod 4, Recharts, Vitest 5. All are current. The interface is built by
hand from Tailwind tokens: fonts (Instrument Sans, Unbounded), a dark palette, a glow background.
It has no headless primitive library, which [frontend.md](https://github.com/get-latest/company/blob/main/engineering/standards/frontend.md)
requires for select, dialog, tabs, tooltip, menu and similar behaviour.

## Decision

1. **Keep Next.js, React, Tailwind, Supabase.** No framework rewrite.
2. **Adopt shadcn/ui** (components copied into `web/src/ui`, built on Radix primitives and
   Tailwind 4) as the one headless-primitive library. Behavioural components (dialog, select,
   tabs, tooltip, dropdown, toast) come from it; focus trapping and roving tabindex are not
   hand-written. Its tokens map onto the existing design tokens in `globals.css`.
3. **Adopt Motion** for animation: number count-ups, leaderboard reordering, page and list
   transitions. Every animation honours `prefers-reduced-motion`.
4. **Keep Recharts** for charts (shadcn's chart component wraps it).
5. **A `/design` route** renders every kit component in every state, with its import path, and a
   test fails when a kit component is missing from it.
6. The app stays **dark-only** (decision in `docs/PLAN.md`, 2026-09-26).

## Alternatives considered

- **SvelteKit, Nuxt, React Router 7, Astro.** None is meaningfully better for an authenticated,
  data-heavy dashboard on Supabase. Astro is content-first, the wrong fit. SvelteKit animates
  nicely but the standards, the pgTAP-tested database contract and roughly 7,000 lines of tested
  TypeScript would need re-deriving for a gain that is really about design, not framework.
- **Hand-rolled primitives (status quo).** Works, but every dialog and select re-solves focus and
  keyboard behaviour, and the standards forbid it.
- **Another component library (MUI, Mantine, Chakra).** Heavier, and they impose their own look;
  shadcn/ui is source we own and can restyle.
- **Motion vs CSS only.** CSS covers simple transitions. Layout animation and animated numbers are
  the ones worth a library, and Motion is the maintained successor of Framer Motion.

## Consequences

Easier: accessible, consistent controls, and a clear place for every component. A polished feel
comes from the kit plus motion, not from bespoke one-off markup.

Harder: two new dependencies to keep current, and migrating existing forms and components is a
sizeable, staged piece of work. The kit's copied source is ours to maintain.

## Migration or rollback implications

Migration is incremental and starts with the largest hand-built forms (`BuyInForm`, `TradeForm`).
Each component moves in its own commit. Removing the kit would mean restoring hand-built
primitives, which is why it is recorded here.
