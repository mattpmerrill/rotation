# AGENTS.md

This repo follows the [GetLatest engineering standards](https://github.com/get-latest/company/tree/main/engineering).
The first part of this file is the standards' enforceable digest, copied unchanged except that its
relative links are made absolute so they resolve from here. The project section at the end covers
what is local to this app: its layers, vocabulary, commands and deliberate deviations. It does not
restate the standards and does not contradict them. When in doubt, the detail doc wins.

The enforceable digest of the [engineering standards](https://github.com/get-latest/company/blob/main/engineering/README.md). If you are writing or changing code, follow these. They are the rules most often broken; the linked docs carry the full detail and the reasoning. When in doubt, the detail doc wins over this summary.

Vocabulary: **MUST** / **MUST NOT** block the push. **SHOULD** needs a documented reason to skip. **MAY** is optional.

## Before you write code

- If you are an agent, [building-with-agents.md](https://github.com/get-latest/company/blob/main/engineering/standards/building-with-agents.md) governs how you work: evidence before assertion, what "done" requires, and what you do not decide alone. Read it once per project, not once per task.
- Understand the change in the context of the existing code. Match the surrounding conventions.
- Put code where it belongs (see the structure below). Do not restructure the repo or move existing work to make your change fit.
- Do not change the framework, runtime, package manager, validation library, test framework, or state approach as a side effect. That is an ADR-level decision.

## Non-negotiables

- **MUST NOT** put business logic in `page.tsx`, `layout.tsx`, `route.ts`, or React components. Every request that reaches data goes `route handler -> service -> repository -> database`: the handler does transport and auth, the service is the use case, and the repository is the only place a query against its table is built ([ADR-004](https://github.com/get-latest/company/blob/main/engineering/decisions/ADR-004-handler-service-repository.md)).
- **MUST NOT** re-declare a domain concept. One module owns a concept's type, values and rules; everything else imports it. Not a literal array, not a narrowed copy, not "just the keys I need here".
- **MUST NOT** let pure domain modules import React, Next.js, Supabase, or browser APIs. **MUST NOT** import server-only/admin modules into client code. No circular imports.
- **MUST** validate every input from outside the trust boundary at runtime with a schema (forms, params, request bodies, webhooks, env vars, external/model responses). Types are not validation.
- **MUST** re-check auth and authorization at every Server Action, Route Handler, and data-access boundary. The proxy is not the authorization boundary.
- **MUST** keep RLS authoritative: every exposed table has policies, and a change to access ships with an allowed-access **and** a denied-access test.
- **MUST NOT** hand-edit generated database types. Regenerate them after a schema change.
- **MUST NOT** silently swallow an error or turn every error into `null`. **MUST NOT** expose stack traces, SQL, secrets, or provider payloads to users.
- **MUST NOT** weaken a lint, type, security, or test rule, or bypass validation, to make an unrelated change pass.
- **MUST NOT** log secrets, tokens, payment details, or unnecessary personal data.

## By area (the short version)

- **Architecture** ([architecture.md](https://github.com/get-latest/company/blob/main/engineering/standards/architecture.md)) - one deployable app, organized by business domain; the handler/service/repository chain above; layers `presentation -> application -> domain -> infrastructure`, one direction, and shared code never imports a domain module. One concept, one definition. Database rows are not domain models.
- **Types** ([stack/typescript.md](https://github.com/get-latest/company/blob/main/engineering/stack/typescript.md)) - `strict` on; no `any` (use `unknown` + narrow); no non-null `!` except after an invariant check; discriminated unions for state, not boolean soup; env parsed once, centrally.
- **Data** ([data.md](https://github.com/get-latest/company/blob/main/engineering/standards/data.md)) - constraints enforce invariants (uniqueness, ownership, ranges), not just app code; `timestamptz` UTC; money in minor units or `numeric`, never floats; pagination for any unbounded list; migrations in version control, expand-and-contract for breaking changes.
- **Security** ([security.md](https://github.com/get-latest/company/blob/main/engineering/standards/security.md)) - ASVS L2; admin/service keys server-only; verify identity with `getClaims()`/fresh `getUser()`; verify webhook signatures; rate-limit auth and expensive endpoints.
- **Contracts & errors** ([contracts-and-errors.md](https://github.com/get-latest/company/blob/main/engineering/standards/contracts-and-errors.md)) - return expected failures as a typed result with a stable `code`; throw/log unexpected ones with a correlation ID and a safe generic response; retry only idempotent, transient operations; versioned, both-sides-validated schema for anything crossing the TS/Python boundary.
- **Operations** ([operations.md](https://github.com/get-latest/company/blob/main/engineering/standards/operations.md)) - timeout every external call; bounded retries with backoff; idempotent writes and webhook consumers; every cache documents owner, scope, invalidation, staleness, and failure behavior.
- **Frontend** ([frontend.md](https://github.com/get-latest/company/blob/main/engineering/standards/frontend.md)) - read the product's `/design` page before writing markup and import what exists (the app's project section below names the route and kit path); one primary action per region; look at the change in a browser; no literal color/spacing/radius/shadow/z-index values; behavioral components come from the headless library, not by hand; handle loading/empty/error/success; WCAG 2.2 AA; keyboard + focus; honor reduced-motion; confirm destructive actions; optimistic updates roll back on failure. Full system: [brand/guidelines/design-spec.md](https://github.com/get-latest/company/blob/main/brand/guidelines/design-spec.md).
- **Testing** ([testing.md](https://github.com/get-latest/company/blob/main/engineering/standards/testing.md)) - a bug fix ships a regression test that failed before the fix; a DB change ships migration + regenerated types + RLS tests; an authz change ships allowed + denied tests; a new critical workflow ships happy- and failure-path E2E.
- **AI** ([ai-systems.md](https://github.com/get-latest/company/blob/main/engineering/standards/ai-systems.md)) - model output is untrusted input, schema-validated before use; an LLM does not perform irreversible/high-risk actions without deterministic validation and authorization; version prompt/model/params; cap tokens and cost.
- **Configuration** ([configuration.md](https://github.com/get-latest/company/blob/main/engineering/standards/configuration.md)) - env parsed and validated once, centrally; `NEXT_PUBLIC_` means public; secrets live in the credential store and the runtime, nowhere else; never commit a `.env`.
- **Integrations** ([integrations.md](https://github.com/get-latest/company/blob/main/engineering/standards/integrations.md)) - one adapter per vendor, vendor types never leak past it; timeout, bounded retry, schema-validated response; verify webhook signatures and deduplicate by event ID; record what each metered call cost.
- **Observability** ([observability.md](https://github.com/get-latest/company/blob/main/engineering/standards/observability.md)) - structured JSON to stdout always, carrying the correlation ID; archive errors and audit events to Storage after the response, never on the critical path; alerts go to Telegram.
- **Python** ([stack/python.md](https://github.com/get-latest/company/blob/main/engineering/stack/python.md)) - annotate boundaries, static-check in CI; no `dict[str, Any]` default; tz-aware datetimes; no bare `except`; context managers; no notebooks as production; don't block the event loop in async.

## Before you call it done

Meet the [Definition of Done](https://github.com/get-latest/company/blob/main/engineering/standards/definition-of-done.md) and the [CI quality gates](https://github.com/get-latest/company/blob/main/engineering/standards/engineering-standards.md#ci-quality-gates). A push to `main` deploys to production, so the gate is before the push, not before a merge ([version-control.md](https://github.com/get-latest/company/blob/main/engineering/standards/version-control.md)).

At minimum, before you claim completion: the full check command was run and passed after your last edit, the required tests for this change type exist and pass, migrations and generated types are current, no secret is exposed, and the change has a safe deploy/rollback path. Do not say "done" for work that is only committed locally.

If you cannot satisfy a MUST, do not quietly skip it. Record it as an [exception](https://github.com/get-latest/company/blob/main/engineering/standards/version-control.md#exceptions-without-a-pull-request) with a reason and an expiry, or stop and ask.

---

# Project: the 1 Bitty Challenge

A small web app where Matt and three friends each swap up to 1 BTC into an alt basket and compete on
BTC at the end. Scored in BTC. Owner: Matt. The decisions are in [docs/PLAN.md](docs/PLAN.md); do not
reverse one without Matt.

## Read first

0. [docs/status.md](docs/status.md): where the last session left off, what is open, and what to do next.
1. [docs/architecture.md](docs/architecture.md): what goes where and why.
2. [CONTRIBUTING.md](CONTRIBUTING.md): the working rules and the check commands.
3. [docs/decisions/](docs/decisions/): the ADRs. [docs/exceptions.md](docs/exceptions.md): the known
   gaps, each with an expiry. [docs/enforcement-matrix.md](docs/enforcement-matrix.md): which rules
   are checked by a tool and which are not.
4. In `web/`, also read `web/AGENTS.md`: Next.js 16 differs from older versions. Check
   `web/node_modules/next/dist/docs/` before using an API.

## Layers (web/src)

`app -> features -> data -> domain -> lib`, plus `ui`. ESLint enforces the direction (and
dependency-cruiser checks for cycles). Do not disable a rule to make code pass; move the code.

- `domain/`: challenge rules and money math, pure TypeScript with tests. BTC is integer sats
  ([ADR-003](docs/decisions/ADR-003-btc-quantities-as-integer-sats.md)).
- `data/`: everything that talks to Supabase, Discord or the environment. Server-only.
- `features/<name>/`: one folder per capability. Features never import each other.
- `app/`: thin routes. Check access, call one feature query or action, render.
- `ui/`: presentational components. Props in, markup out.

New code follows the handler, service, repository chain. Existing features are migrated one at a
time; do not extend the old shape ([exception 1](docs/exceptions.md)).

## Vocabulary

Names are the words a person using the app would use: **entry** (a person's run), **basket**,
**buy-in**, **waiting slot**, **fill**, **sell**, **rebuy**, **challenge**, **standings**.

## Frontend

The design system is the tokens in `web/src/app/globals.css` and the components in `web/src/ui`.
A `/design` route that renders every kit component in every state, and a census test that fails when
one is missing, arrive with the UI kit ([ADR-002](docs/decisions/ADR-002-design-kit.md)); until then
read `web/src/ui` and `globals.css` before writing markup and reuse what exists. The kit import path
is `@/ui/*`. The app is dark-only. No literal colours: the lint rule refuses them.

## Commands (all must pass before you say "done")

| Part | Command |
|---|---|
| Everything | `node scripts/check.mjs` (what the pre-push hook runs) |
| web | `cd web && npm run check` and `npm run build` |
| engine | `cd engine && uv run ruff check src tests && uv run ruff format --check src tests && uv run mypy && uv run pytest` |
| database | `supabase test db` (needs Docker) |
| e2e | `cd web && npm run e2e` (needs a built app; see CONTRIBUTING) |

Say what you ran and what you could not run. Say when a UI change was not looked at in a browser.

## Non-negotiables specific to this repo

- Fairness rules (1 BTC cap, basket size, no overselling, slot shares) live in the database and are
  mirrored in `domain/` for friendly messages. Keep the two in step; `domain/rules.ts` names the
  migration.
- Schema changes are new migrations with explicit grants and a pgTAP test. Never edit a migration
  that has been applied to production. Regenerate `web/src/data/database.types.ts` after a change.
- Every Server Action starts with `requireMember()`: actions are reachable by direct POST.
- **Never put amounts or holdings in Discord messages, and never commit Matt's holdings, account
  type or any secret.** The repo is private today; assume it may be shown publicly.
- Commit subjects are `<area>: <what changed>`, with no em-dash or en-dash anywhere in the message.
