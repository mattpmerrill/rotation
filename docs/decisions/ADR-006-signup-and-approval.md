# ADR-006: Anyone can sign up; an admin approves; email confirmation is off for now

- **Status**: Accepted
- **Date**: 2026-09-28
- **Owner**: Matt Merrill

## Context

The challenge is for a handful of friends. Until now, adding one meant the owner running SQL by hand
(`update profiles set is_member = true ...`), and email sign-up could not work for them at all: the
project had no email service, and Supabase's built-in sender refuses to deliver to any address that is
not on the Supabase organization's team ("Email address not authorized"). So a friend who tried to
create an account with an email would never receive the confirmation, and could not sign in.

The goal: make joining as easy as possible for friends, without letting strangers in.

## Decision

1. **Anyone can create an account; nobody sees anything until an admin approves them.** Signing up
   gives an account and a "waiting for approval" screen that refreshes itself. It gives no access to
   the challenge (row-level security still decides everything, ADR-002).
2. **An admin approves from a People page** (`/admin`, admins only, `profiles.is_admin`). It lists
   who is waiting, with a one-tap Approve and a two-tap Reject, and who is in, with a two-tap Remove
   and a sign-in help link. When someone new arrives the admin is told once in Discord (names only,
   never an email address) and sees a badge in the header.
3. **Email confirmation is off for now.** Google sign-in verifies the email itself, and email sign-up
   works immediately with no email service. The approval step is the gate: the admin sees each
   address and approves only people they know.
4. **A forgotten password is fixed by the admin, not by an email.** The admin makes a one-time
   sign-in help link and sends it privately. It signs the person in and lets them choose a new
   password, works once, and expires within an hour. There is no self-serve "forgot password" until
   there is an email service.
5. **The admin's powers are database functions that check the caller and leave a trail.** Approve,
   remove a membership, reject a sign-up and record a help link are `SECURITY DEFINER` functions that
   raise a permission error unless the caller is an admin, in the same shape as ADR-005, and each
   writes an `admin_actions` row (ids only, no personal data). Admin status is not editable through
   the API, not even with the secret key: it is set with SQL, as the owner's was.
6. **Creating an account for an email that already has one does not say so.** If the password given
   also matches, the person is simply signed in (they forgot they had signed up). Otherwise they get
   the same neutral message either way, so a stranger cannot learn which emails are registered.
7. **The sign-in page never shows text taken from the URL.** Failures carry a short code
   (`?error=expired`) and the page shows a fixed message for it. Provider and Auth error text is
   logged, not shown.

The server also requires a password of at least 10 characters, matching the app's own rule.

## Alternatives considered

- **Pre-approve by email (an invite list).** Friends would get in with no waiting at all. It needs
  a verified email to be safe (otherwise anyone could claim a friend's address), which needs the email
  service this decision defers. Worth adding once there is one; the approval queue still covers
  everyone else.
- **A shared invite code or link.** Very easy, but a leaked link admits anyone, and it gives the admin
  no view of who joined.
- **Set up real email delivery now** (a domain with Resend, or a Gmail app password). Best long term:
  confirmation and reset emails. It needs a sender identity and a credential the owner creates, and the
  owner chose to defer it. Nothing here prevents it.
- **Google sign-in only.** Simplest and safest, but excludes friends without a Google account.
- **Do approval with SQL, as before.** No new code, but every friend would wait on the owner opening
  a database console.

## Consequences

Easier: a friend signs up in one tap or one short form and is in as soon as the admin taps Approve,
with nothing to run and no console to open. The admin has one page, an audit trail, and a way to help
someone who forgot a password.

Harder, and named:

- **No password-reset or confirmation emails** until an email service exists (exception 17). A
  forgotten password needs the admin.
- **With confirmation off, someone could register a friend's email before the friend does.** The
  admin would see an unexpected sign-up and reject it, and the friend would then use the help link or
  Google. At four people this is acceptable; it is why the queue exists.
- **More `SECURITY DEFINER` functions callable by signed-in users** (five, listed below), on top of
  ADR-005's five. Each follows the same four properties and has allowed and denied pgTAP tests.
- Every sign-up is an account in Auth even if never approved. The admin can delete an unapproved one.

The five new functions: `is_admin`, `admin_list_people`, `admin_set_member`, `admin_reject_signup` and
`admin_record_help_link`. Each checks `is_admin()` (except `is_admin` itself, which reports only the
caller's own flag), sets `search_path = ''`, revokes `EXECUTE` from `public` and `anon`, and grants it
to `authenticated` only.

## Migration or rollback implications

The migration (`signup_approval`) is additive: one column, one table and five functions, so reversing
it is dropping them, and the app degrades to "nobody is an admin". Turning email confirmation back on
is a setting in Supabase Auth plus a custom SMTP provider; the app already handles both outcomes (it
signs the person in straight away when confirmation is off, and asks them to check their email when it
is on).
