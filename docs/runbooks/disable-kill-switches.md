# Disable a kill switch

**Status: UNTESTED.** Use when something is misbehaving and must stop now, before it is
understood. Each switch is reversible.

| Switch | Stops | How | Turn back on |
|---|---|---|---|
| Daily job | Market-data refresh and the notification call | `gh workflow disable daily` | `gh workflow enable daily` |
| New sign-ups | Anyone creating an account | [adding-players.md](adding-players.md#stopping-new-sign-ups) | Same page, set it back |
| Discord posts | All Discord messages | Remove `DISCORD_WEBHOOK_URL` from Vercel: `vercel env rm DISCORD_WEBHOOK_URL production`, redeploy. Without it the job skips posting and records nothing, so it posts once the webhook is back. | `vercel env add DISCORD_WEBHOOK_URL production`, redeploy |
| Notification endpoint | Anything calling `/api/jobs/daily` | Rotate `CRON_SECRET` to a value only you know ([rotate-credentials.md](rotate-credentials.md)) | Set it back on both sides |
| A member's access | That person's reads and writes | In the Supabase SQL editor: `update profiles set is_member = false where id = (select id from auth.users where email = '...');` | Set it back to true |
| Everyone's writes | All logging and editing | `update profiles set is_member = false;` (members see the "not in the challenge yet" screen) | Restore the flags; note who was a member first |
| The whole app | Everything | Roll back or take the Vercel project offline from the dashboard | See [rollback-deployment.md](rollback-deployment.md) |

Note the current members before changing anything: `select email, is_member from profiles join
auth.users using (id);`
