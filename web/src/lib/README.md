# lib

Small, generic helpers with no business meaning: calendar days, number formatting, the `ApplicationResult` type, the JSON logger, a safe `next` path, the security header builder. Framework-free and I/O-free, so anything can import them, including `domain`.

May import: only `lib` itself (no `@/` alias at all). ESLint refuses React and Next here, and dependency-cruiser refuses Node built-ins and server-only modules.

Plumbing that needs Next, Supabase or the environment (the clients, `env.ts`, the access guards) lives in `data/`, where `server-only` keeps it out of client code.

Example, `result.ts`: `ok(data)` and `fail(code, message)` build the one result shape every use case returns, with a stable `code` the caller branches on and a `message` written for a person.
