# Rotate credentials

**Status: UNTESTED.** Rotate when a secret appears anywhere it should not, when someone with
access leaves, when a vendor reports exposure, or when a documented interval passes. Order matters:
revoke at the vendor, update every place that holds the value, then check that nothing is broken.
Never paste a secret into chat, an issue or a commit message.

Where each one lives (names only):

| Credential | Vercel (prod) | GitHub secret | Local | Rotate at |
|---|---|---|---|---|
| `SUPABASE_SECRET_KEY` | yes | | `web/.env.development.local` (local stack key, different) | Supabase, Project Settings, API keys |
| Supabase publishable key (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) | yes, public by design | | same | Supabase, API keys |
| `SUPABASE_DB_URL` (database password) | | yes | `.env` | Supabase, Database, reset password |
| `CRON_SECRET` | yes | yes | | generate: `openssl rand -hex 32` |
| `DISCORD_WEBHOOK_URL` | (not set yet) | yes | `.env` | Discord channel settings, Integrations |
| `COINGECKO_API_KEY` | (not set) | yes | `.env` | CoinGecko developer dashboard |
| Google OAuth client secret | | | | Google Cloud console, then Supabase Auth, Providers |

## Steps for any one credential

1. Create the new value at the vendor. Where the vendor supports two active keys, add the new key
   first so there is no window with no valid key.
2. Update Vercel: `vercel env rm <NAME> production`, then `vercel env add <NAME> production`
   (paste the value when prompted). Redeploy so it takes effect.
3. Update GitHub: `gh secret set <NAME>` (paste the value when prompted).
4. Update `.env` locally if it is used there.
5. **Revoke the old value at the vendor.** A rotated key that was never revoked has not been
   rotated.
6. Check: load the app signed in; run the `daily` workflow by hand (`gh workflow run daily`) and
   confirm it goes green.

## What breaks while rotating

- `CRON_SECRET`: the daily job's notification call gets a 401 until both sides match. Change both
  in one sitting.
- `SUPABASE_SECRET_KEY`: the notification job fails until Vercel has the new key and is redeployed.
- `SUPABASE_DB_URL`: the engine's market-data step fails until the GitHub secret is updated.

## If the credential store or repo was exposed

Treat every credential above as disclosed and rotate all of them.
