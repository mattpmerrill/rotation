# Roll back a deployment

**Status: UNTESTED.** Use when the live app is broken after a deploy.

1. Find the last good deployment: `vercel list rotation-web` (newest first). Note its URL or ID.
2. Roll production back to it: `vercel rollback <deployment-url-or-id>`. This takes seconds and
   does not change `main`.
3. Check the live app: open the production URL, sign in, load the leaderboard. Once `/api/health`
   exists, `curl -s <production-url>/api/health` shows which commit is live.
4. **Make `main` match**, or the next push redeploys the break: `git revert <bad-commit-sha>`,
   run the checks, `git push`. Confirm the new deployment goes green.
5. If the bad change included a database migration, a rollback of the code does not undo it.
   Migrations are backward compatible by rule (expand and contract), so the old code should still
   run; if it does not, fix forward with a new migration. Never edit an applied migration.
6. Write the incident record in `docs/incidents/`.

Once this has been run for real (or as a drill while nothing is wrong), replace "UNTESTED" with the
date and what was learned.
