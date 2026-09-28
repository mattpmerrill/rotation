# Adding players

How a friend joins, and what the admin does. The decision behind it is
[ADR-006](../decisions/ADR-006-signup-and-approval.md).

**Status.** The whole journey below (sign up, wait, approve, help link, reject) is exercised by
`web/e2e/signed-in` against a real local Supabase and runs in CI. On 2026-09-28 it was also run on
production with a throwaway account (deleted afterwards): sign-up with email, the waiting screen, and the
screen switching to the challenge by itself once the account was approved (with SQL, because the Approve
button needs an admin session). It has not yet been run by a real friend, and nobody has yet used the
Approve button on production. Making an admin with SQL, and the Management API call that sets auth
settings (`mailer_autoconfirm`, `password_min_length`), were done on production on 2026-09-28. Turning
sign-ups off and turning email confirmation back on are untested.

## What a friend does

1. Open the link to the app. Either tap **Continue with Google** (nothing to type), or tap **Create an
   account** and fill in name, email and a password of at least 10 characters.
2. They land on **"You're in the queue"**. There is nothing else to do: the page checks every few seconds
   and turns into the challenge as soon as they are approved. They do not need to reload or sign in again.
3. Once in, they pick a basket.

If they forgot their password, they tell the admin (see "Someone forgot their password").

## What the admin does

1. **Watch for the ping.** When someone new is waiting, Discord gets one message with their name (never
   their email), once `DISCORD_WEBHOOK_URL` is set in Vercel. Either way, a badge with the number waiting
   shows next to **People** in the header.
2. Open **People**. Each person waiting shows their name, their email and how they signed up. Check it is
   someone you know.
3. Tap **Approve**. Their screen switches to the challenge by itself.
4. If it is someone you don't know, tap **Reject**, then tap again to confirm. That deletes the account.

## Someone forgot their password

There are no reset emails while there is no email service ([exception 17](../exceptions.md)).

1. On **People**, find them under "In the challenge" and tap **Sign-in help link**.
2. Copy the link that appears and send it to them **privately** (a text or a DM, not the group channel).
   Anyone with the link can sign in as them once.
3. They open it, they are signed in, and they choose a new password. The link works once and expires
   within an hour. If it expired or was used, make another.

The link is recorded in the audit trail before it exists. An admin cannot make one for another admin.

## Removing someone

On **People**, tap **Remove** and confirm. They lose access to the challenge; their basket and trades, if
any, are kept and can be restored by approving them again. Rejecting an account deletes it, and is only
possible for someone who was never approved (a member's basket would go with them).

## Making someone an admin

Admin status is not settable through the app or the API, not even with the secret key. It is a one-off SQL
statement, run by the owner in the Supabase SQL editor (or with the Supabase MCP):

```sql
update public.profiles set is_admin = true, is_member = true
where id = (select id from auth.users where email = 'their-email@example.com');
```

Check that exactly one row changed. The person then sees **People** in their header.

## Stopping new sign-ups

If something goes wrong (spam accounts, a leaked link), stop sign-ups. This does not affect people who
already have accounts.

1. Supabase dashboard, project `rotation`, Authentication, Sign In / Providers: turn off **Allow new
   users to sign up**.
2. Or by the Management API, with your access token in `SUPABASE_ACCESS_TOKEN`:
   `curl -X PATCH -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d '{"disable_signup":true}' https://api.supabase.com/v1/projects/xtccrljmxtjmxbosczrd/config/auth`
   (set it back to `false` to reopen).

## Turning email confirmation back on

When there is an email service (a custom SMTP provider, such as Resend on a domain you own, or a Gmail app
password):

1. In the Supabase dashboard, Authentication, Emails, SMTP settings: enter the provider's details. The
   credential is entered there, and nowhere else (never in this repo or in chat).
2. Turn **Confirm email** on. The app already handles it: after sign-up it says "Check your email" instead
   of signing the person in straight away.
3. Send yourself a test sign-up first. Then add a self-serve "forgot password" and retire exception 17.
