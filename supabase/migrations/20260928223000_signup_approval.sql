-- Sign-up approval (ADR-006). Anyone can create an account; nothing is visible until an admin
-- approves them (profiles.is_member). This adds the admin flag and the admin's own entry points.
--
-- The functions are SECURITY DEFINER with an empty search_path, check the caller themselves, and are
-- executable only by `authenticated` (ADR-005 lists the properties). Every admin action is recorded
-- in admin_actions, by ids only: no email addresses or names are stored there.

-- 1. The admin flag -----------------------------------------------------------------------------
-- Not editable by a person: profiles' update grant is limited to display_name (challenge migration).
alter table public.profiles add column is_admin boolean not null default false;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = (select auth.uid())), false)
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- 2. The audit trail ------------------------------------------------------------------------------
create table public.admin_actions (
  id     bigint generated always as identity primary key,
  actor  uuid        not null,
  action text        not null check (action in ('approve', 'remove_member', 'reject_signup', 'help_link')),
  target uuid        not null,
  at     timestamptz not null default now()
);
alter table public.admin_actions enable row level security;
revoke all on public.admin_actions from public, anon, authenticated;
grant select on public.admin_actions to authenticated; -- narrowed to admins by the policy below
grant all on public.admin_actions to service_role;
create policy "admins read the audit trail" on public.admin_actions
  for select to authenticated using ((select public.is_admin()));

-- 3. What an admin can do -------------------------------------------------------------------------
-- Everyone who has signed up, newest unapproved first. Reads the email from auth.users, which the
-- app's own roles cannot read; that is why this is a function and not a view.
create function public.admin_list_people()
returns table (
  id uuid, email text, display_name text, is_member boolean, is_admin boolean,
  created_at timestamptz, provider text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then
    raise exception 'Only an admin can do that' using errcode = '42501';
  end if;
  return query
    select p.id, u.email::text, p.display_name, p.is_member, p.is_admin, p.created_at,
           coalesce(u.raw_app_meta_data ->> 'provider', 'email')
    from public.profiles p join auth.users u on u.id = p.id
    order by p.is_member, p.created_at desc;
end $$;
revoke execute on function public.admin_list_people() from public, anon;
grant execute on function public.admin_list_people() to authenticated;

-- Approve someone, or take their membership away (their entry, if any, is kept).
create function public.admin_set_member(p_user_id uuid, p_is_member boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare target public.profiles;
begin
  if not (select public.is_admin()) then
    raise exception 'Only an admin can do that' using errcode = '42501';
  end if;
  select * into target from public.profiles where id = p_user_id;
  if not found then
    raise exception 'That person was not found' using errcode = 'P0002';
  end if;
  if target.is_admin and not p_is_member then
    raise exception 'An admin can''t lose membership' using errcode = '23514';
  end if;
  update public.profiles set is_member = p_is_member where id = p_user_id;
  insert into public.admin_actions (actor, action, target)
    values ((select auth.uid()), case when p_is_member then 'approve' else 'remove_member' end, p_user_id);
end $$;
revoke execute on function public.admin_set_member(uuid, boolean) from public, anon;
grant execute on function public.admin_set_member(uuid, boolean) to authenticated;

-- Reject a sign-up: delete an account that has not been approved. Members and admins are never
-- deleted here (a member's entry and trades would go with them): use admin_set_member for those.
create function public.admin_reject_signup(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare target public.profiles;
begin
  if not (select public.is_admin()) then
    raise exception 'Only an admin can do that' using errcode = '42501';
  end if;
  select * into target from public.profiles where id = p_user_id;
  if not found then
    raise exception 'That person was not found' using errcode = 'P0002';
  end if;
  if target.is_member or target.is_admin then
    raise exception 'Only someone who has not been approved can be rejected' using errcode = '23514';
  end if;
  delete from auth.users where id = p_user_id; -- the profile goes with it
  insert into public.admin_actions (actor, action, target)
    values ((select auth.uid()), 'reject_signup', p_user_id);
end $$;
revoke execute on function public.admin_reject_signup(uuid) from public, anon;
grant execute on function public.admin_reject_signup(uuid) to authenticated;

-- The app records the one action it performs itself with the service key (a sign-in help link).
create function public.admin_record_help_link(p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then
    raise exception 'Only an admin can do that' using errcode = '42501';
  end if;
  insert into public.admin_actions (actor, action, target)
    values ((select auth.uid()), 'help_link', p_target);
end $$;
revoke execute on function public.admin_record_help_link(uuid) from public, anon;
grant execute on function public.admin_record_help_link(uuid) to authenticated;
