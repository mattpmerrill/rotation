# ADR-005: Fairness rules run as SECURITY DEFINER functions the signed-in role can call

- **Status**: Accepted (extended by [ADR-006](ADR-006-signup-and-approval.md), which adds five admin functions under the same rules)
- **Date**: 2026-09-28
- **Owner**: Matt Merrill

## Context

The challenge's fairness rules (at most 1 BTC in, 2 to 8 coins, exact slot shares, no
overselling, edits only before the first sell) must hold no matter which client writes. They live
in the database (the "RLS everywhere" rule in the engineering standards:
RLS and the database are authoritative). Several operations write more than one row at once and
must be atomic: starting an entry with its buy-in trades, editing one, filling a waiting slot,
deleting one.

Supabase's security advisor reports five `SECURITY DEFINER` functions in the exposed `public`
schema that the `authenticated` role can execute: `start_entry`, `edit_entry`, `fill_slot`,
`delete_entry` and `is_member`. On 2026-09-28 the advisor showed exactly these five as warnings
and nothing else of that kind.

## Decision

These five functions stay `SECURITY DEFINER` and callable by `authenticated`, because each is a
deliberate, narrow entry point that does its own authorization:

- Each checks the caller with `auth.uid()` and `public.is_member()` before doing anything, and
  raises a permission error (`42501`) otherwise. `delete_entry`, `edit_entry` and `fill_slot`
  also check that the entry belongs to the caller.
- Each is created with `set search_path = ''` and schema-qualified names, so a caller cannot
  redirect it.
- Each has `EXECUTE` revoked from `public` and `anon`, and granted only to `authenticated`.
- `is_member()` returns only the caller's own membership flag and is what the RLS policies call.
- The pgTAP suite (`supabase/tests/database/challenge.test.sql`) tests allowed and denied access.

A new `SECURITY DEFINER` function needs the same four properties, a pgTAP allowed and denied
test, and an addition to this ADR.

## Alternatives considered

- **`SECURITY INVOKER` with RLS only.** Fine for single-row inserts (entry trades use it), but
  the multi-row operations would need several client round trips and could not be atomic, or would
  need policies that let a person write rows the rules must forbid them from writing directly.
- **Move the functions to a private schema and call them with the secret key from the server.**
  Cleaner for the advisor, but every write then runs as a superuser-equivalent role with the
  application as the only check, which is the situation the standards' RLS decision exists to
  avoid.
- **Do the multi-row writes in application code.** Loses atomicity and moves the fairness rules
  out of the database.

## Consequences

Easier: one atomic, database-enforced entry point per operation, testable with pgTAP.

Harder: the advisor's warnings stay on, and each new function needs discipline. The advisor
output has to be read as "known and accepted" for these five and as a real finding for any other.

## Migration or rollback implications

Reversing this means rebuilding the atomicity and the fairness rules elsewhere, which is why it
is recorded. Nothing changes in the database now.
