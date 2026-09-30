# Runbooks

Procedures you do not want to be inventing at the time. Each is a numbered list of commands and
checks, written to be read by someone in a hurry. They follow the incident standard
(see [ADR-001](../decisions/ADR-001-adopt-engineering-standards.md)).

**Every runbook here is UNTESTED until it says otherwise.** The standards ask for the rollback and
the restore to be exercised once while nothing is wrong. That has not happened yet, and it is
tracked in [../exceptions.md](../exceptions.md).

| Runbook | When |
|---|---|
| [rollback-deployment.md](rollback-deployment.md) | The live app is broken right after a deploy |
| [restore-database.md](restore-database.md) | Data is lost or wrong, or the Supabase project is gone |
| [rotate-credentials.md](rotate-credentials.md) | A secret leaked, someone left, or a rotation is due |
| [adding-players.md](adding-players.md) | A friend is joining, forgot their password, or sign-ups need to stop |
| [disable-kill-switches.md](disable-kill-switches.md) | Something is misbehaving and needs to stop now |

## First moves in any incident

1. Stop the bleeding before understanding it: roll back first, diagnose second.
2. If a credential is involved, rotate before anything else.
3. If data is wrong, stop the writer before repairing the data.
4. Capture evidence before it ages out: Vercel logs, the failing request, deployment ID, time.
5. Write a short record in `docs/incidents/` afterwards: the mechanism, the fix, and the guard
   that would have caught it.

Where things live: the app runs on Vercel (project `rotation-web`, team `matts-projects`); the
database is the Supabase project `rotation` (ref `xtccrljmxtjmxbosczrd`); the scheduler is
GitHub Actions in `mattpmerrill/rotation`.
