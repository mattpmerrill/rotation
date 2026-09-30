# ADR-003: BTC quantities are integer satoshis in the domain layer

- **Status**: Accepted
- **Date**: 2026-09-28
- **Owner**: Matt Merrill

## Context

The data standard says money is
"integer minor units or Postgres `numeric`. Never floating point." The database follows that
(`numeric` columns). The web app does not: `data/challenge.ts` reads `Number(row.btc_in)`, and the
domain layer (`web/src/domain`) computes valuations, fills and standings in JavaScript floats.

The amounts are small (at most 1 BTC per person, four people), so today's errors are far below a
displayed digit. But slot shares, fees and fill checks compare floating point numbers against
tolerances (`usdtAfter(draft) < -0.01`), and the database enforces exact rules on the same values.
When two implementations round differently, the friendly message and the database refusal
disagree. That is the failure the standards' canonical-definitions rule exists to prevent.

## Decision

- **BTC quantities are integer satoshis** (1 BTC = 100,000,000 sats) inside `web/src/domain`.
  A single module owns the unit: conversion to and from sats, formatting, and rounding.
- **Other coin quantities** stay `numeric` in the database. In the domain layer they are decimal
  strings converted at the edge, not JavaScript numbers, once the BTC work has landed.
- **USD amounts** are integer cents, or `numeric` in the database. Prices are ratios and may
  stay as numbers where they are only displayed or multiplied into a display value.
- **Conversion happens once, at the data layer boundary**, when a row becomes a domain object.
  The rest of the app never sees a float BTC amount.
- Tests cover the boundary: rounding a decimal to sats, the maximum entry, and a fill whose share
  is not an exact sat.

## Alternatives considered

- **Keep floats and record an exception.** Honest, cheap, but permanent: the exception would
  need renewing forever, and the tolerance comparisons stay.
- **A decimal library (decimal.js, big.js).** Exact and familiar, but adds a dependency for what
  integers do natively for BTC, and does not fix the unit mismatch with the database.
- **BigInt everywhere.** Exact, but awkward to serialise and to chart. Sats fit safely in a
  JavaScript number (21 million BTC is about 2.1e15 sats, below 2^53).

## Consequences

Easier: exact arithmetic for holdings, no tolerance constants, the app and the database agree by
construction, and a unit mismatch becomes a type error (branded `Sats` type).

Harder: every place that reads or shows a BTC amount changes, so it touches most of `domain/` and
the components that display amounts. It is done in the architecture phase, with the domain tests
updated first.

## Migration or rollback implications

No database change: `numeric` columns already hold exact values. The change is confined to the
web app and reversible by commit. Until it lands, the gap is recorded in
[exceptions.md](../exceptions.md) with an expiry.
