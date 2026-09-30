Read [AGENTS.md](AGENTS.md) first. It is the contract for this repo.

Claude-specific notes:

- This is Next.js 16, which differs from older versions. Check `web/node_modules/next/dist/docs/`
  before using a Next API (for example `proxy.ts` replaces `middleware.ts`, and `params` is a
  promise). `web/AGENTS.md` has the same warning for work inside `web/`.
- Run `node scripts/check.mjs` after your last edit and say what you ran. If a UI change was not
  viewed in a browser, say so.
- Never print or commit `.env`, `web/.env*` or anything from `supabase status` that is a key.
- Do not disable a lint rule to make code pass; move the code to the right layer.
- Stage files by path, never `git add -A`. A push to `main` deploys to production, so do not push
  without the owner's go-ahead.
- The browser tests use port 3187 and the screenshot script uses 3188; stop a server you started by
  its PID, not with a broad `pkill`.
