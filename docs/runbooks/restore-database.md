# Restore the database

**Status: UNTESTED, and there is no backup of user data today.** See exception 11 in
[../exceptions.md](../exceptions.md). Until a scheduled dump exists, members' baskets and trades
cannot be recovered if they are lost.

What is rebuildable and what is not:

| Data | Source of truth | Rebuildable? |
|---|---|---|
| Schema, policies, functions | `supabase/migrations/` in git | Yes |
| Coins, daily prices, market state | CoinGecko and CoinMetrics; older history in the local Parquet cache `data/` on Matt's Mac only | Recent days yes; older history only from that cache |
| Profiles, entries, trades, notifications | The database itself | **No**, unless a dump exists |

## If data was deleted or corrupted

1. **Stop the writer first**: pause the app's writes by following
   [disable-kill-switches.md](disable-kill-switches.md), or set every `profiles.is_member` to false
   in the SQL editor if members might keep writing.
2. Check the Supabase dashboard, Database, Backups. On the free plan there may be nothing; if a
   backup or point-in-time option exists for the current plan, restore from it into a **new
   scratch project first** and check the rows before touching production.
3. If a dump file exists, restore only the affected tables into a scratch project, compare, then
   copy back the missing rows.

## If the project is gone

1. Create a new Supabase project. Note its ref and region.
2. `supabase link --project-ref <new-ref>`, then apply every migration: `supabase db push`.
3. Update the credentials that point at the old project (see
   [rotate-credentials.md](rotate-credentials.md)): Vercel `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and the GitHub secret
   `SUPABASE_DB_URL`, plus `.env` locally. Redeploy.
4. Reload market data from the local cache: `cd engine && uv run rotation load --dry-run`, then
   without `--dry-run`; then `uv run rotation daily`.
5. Members sign up again and `profiles.is_member` is set for them (`docs/PLAN.md`, "Running a
   challenge"). Baskets and trades must be re-entered unless a dump exists.
6. Set the Auth URL configuration and the Google client in the new project.

## Drill

Restore into a scratch project once while nothing is wrong, and record the date here.
