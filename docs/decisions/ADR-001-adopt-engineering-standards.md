# ADR-001: Adopt the GetLatest engineering standards

- **Status**: Accepted
- **Date**: 2026-09-28
- **Owner**: Matt Merrill

## Context

Rotation (the 1 Bitty Challenge) started as a research project and became a small live web app
in five days: Next.js 16 and Supabase for the app, a Python engine for market data and research.
It already had a real structure (`app -> features -> data -> domain -> lib`, enforced by ESLint),
pgTAP tests and CI. It was written before the GetLatest engineering standards were applied to it.
Those standards come from GetLatest AI's internal engineering handbook, which is not public. This
repo carries the parts it follows, in `AGENTS.md`, the ADRs, [exceptions.md](../exceptions.md) and
[enforcement-matrix.md](../enforcement-matrix.md), and cites a rule by name (for example "the
observability standard") where it applies.

The project doubles as a showcase: modern frameworks, a clean architecture, and visible
engineering discipline. An audit against the standards on 2026-09-28 measured the distance:

- there is no service layer: Server Actions carry use-case logic;
- errors are free text, and raw database and Auth messages reach users;
- there is no logging, correlation ID or alerting;
- the compiler baseline is partial, and non-null assertions and casts are unguarded;
- there is no frontend kit, `/design` page, component test, end-to-end test or accessibility check;
- there is no pre-push hook, pinned runtime, secret scan or security headers;
- files are not consistently kebab-case;
- system context, exceptions, runbooks and ADRs did not exist.

## Decision

The application follows the standards as they are written. Where the code does not meet a rule
yet, that is recorded rather than hidden:

- **The chain and canonical definitions** (`route handler -> service -> repository -> database`,
  one definition per concept) apply to new code now. Existing code is brought into line by
  table and feature, in the order in `docs/enforcement-matrix.md`, not in one rewrite.
- **Every known gap** is a row in [enforcement-matrix.md](../enforcement-matrix.md) or an entry
  in [exceptions.md](../exceptions.md) with an expiry date. There is no unrecorded gap.
- **Guards over intentions.** Rules that a tool can check are checked by `npm run check` (web)
  and the pre-push hook. Rules a tool cannot check stay in review, and the matrix says so.
- **Trunk is production.** `main` is the only long-lived branch, and a push to `main` deploys to
  production through Vercel's Git integration (the version-control standard).
  The gate is the local check and the pre-push hook; CI on push is the detector. This is
  acceptable because the team is one person, an agent and four friends, and the cost of a bad
  deploy is a fun project being down for a few minutes.
- **One runtime.** Node 22 everywhere (local, CI, Vercel), Python 3.12 for the engine.

Deviations from the standards, decided on purpose:

- The engine is a research and market-data package, not a product backend. It keeps its own
  layout (`data`, `rules`, `backtest`) rather than the standard's
  `domain/application/infrastructure/workers/api` tree. See [ADR-004](ADR-004-archive-cycle-harvest-engine.md).
- The standards name Telegram as the alert channel. Failure alerts for this project will go to
  Discord, where the players already are (not built yet: see the enforcement matrix).

## Alternatives considered

- **Leave it as it is.** It works, but "clear engineering rules and discipline" would be a
  claim, not a property: half the rules were unenforced and the rest unwritten.
- **Rewrite in another framework.** Considered and rejected. Next.js 16, React 19, Tailwind 4
  and Supabase are the current default stack, and they are the stack the standards cover. A
  rewrite would discard working, tested code and put the project outside the standards' scope.
  See [ADR-002](ADR-002-design-kit.md).
- **Adopt the standards only for new code, with no record of the gaps.** Rejected: the standards
  say an unrecorded gap is a silent amendment.

## Consequences

Easier: every rule has an owner, a check or a dated exception. New code has one obvious place to
go. A reviewer (or an agent) can tell what "done" means.

Harder: more files and more indirection than a four-person app strictly needs, and a slower first
push. The indirection is the point of the showcase; it is not free.

## Migration or rollback implications

Adoption is incremental and can pause between steps: every step leaves the app working and the
checks green. Reversing it means deleting guards and documents, which is cheap, so this ADR
records intent more than a hard-to-reverse choice.
