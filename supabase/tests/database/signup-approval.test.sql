-- Sign-up approval (ADR-006): who can list, approve, remove and reject people, and that every admin
-- action leaves an audit row. Allowed and denied access for each function. Run: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- Fixtures: an admin who is also a member, a member, and two people waiting for approval.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.dev'),
  ('00000000-0000-0000-0000-0000000000b1', 'member@test.dev'),
  ('00000000-0000-0000-0000-0000000000c1', 'waiting1@test.dev'),
  ('00000000-0000-0000-0000-0000000000c2', 'waiting2@test.dev');
update public.profiles set is_member = true, is_admin = true where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set is_member = true where id = '00000000-0000-0000-0000-0000000000b1';

create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true)
$$;

-- As the admin ----------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is(public.is_admin(), true, 'the admin is an admin');
select is((select count(*) from public.admin_list_people() where email like '%@test.dev'), 4::bigint,
  'the admin lists everyone who signed up');
select ok(exists (select 1 from public.admin_list_people() where email = 'waiting1@test.dev' and not is_member),
  'the list has each email and whether they are approved');

select lives_ok($$ select public.admin_set_member('00000000-0000-0000-0000-0000000000c1', true) $$, 'the admin approves someone');
select is((select is_member from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'), true, 'and they are a member');
select is((select count(*) from public.admin_actions where action = 'approve' and target = '00000000-0000-0000-0000-0000000000c1'),
  1::bigint, 'the approval is in the audit trail');

select lives_ok($$ select public.admin_set_member('00000000-0000-0000-0000-0000000000b1', false) $$, 'the admin removes a membership');
select is((select is_member from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'), false, 'and it is gone');
select throws_ok($$ select public.admin_set_member('00000000-0000-0000-0000-0000000000a1', false) $$, '23514', null,
  'an admin cannot lose their own membership');
select throws_ok($$ select public.admin_set_member('00000000-0000-0000-0000-00000000dead', true) $$, 'P0002', null,
  'approving someone who does not exist is refused');

select lives_ok($$ select public.admin_reject_signup('00000000-0000-0000-0000-0000000000c2') $$, 'the admin rejects a sign-up');
select is_empty($$ select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000c2' $$, 'and the account is gone');
select throws_ok($$ select public.admin_reject_signup('00000000-0000-0000-0000-0000000000c1') $$, '23514', null,
  'an approved member cannot be rejected (their basket would go with them)');
select throws_ok($$ select public.admin_reject_signup('00000000-0000-0000-0000-0000000000a1') $$, '23514', null,
  'an admin cannot be rejected');

select lives_ok($$ select public.admin_record_help_link('00000000-0000-0000-0000-0000000000c1') $$, 'the admin records a help link');
select is((select count(*) from public.admin_actions
  where action = 'help_link' and target = '00000000-0000-0000-0000-0000000000c1'), 1::bigint, 'it is in the audit trail');
select throws_ok($$ insert into public.admin_actions (actor, action, target)
    values ('00000000-0000-0000-0000-0000000000a1', 'approve', '00000000-0000-0000-0000-0000000000c1') $$, '42501', null,
  'nobody writes the audit trail directly, not even an admin');

-- As an approved member who is not an admin -----------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select is(public.is_admin(), false, 'a member is not an admin');
select throws_ok($$ select * from public.admin_list_people() $$, '42501', null, 'a member cannot list people');
select throws_ok($$ select public.admin_set_member('00000000-0000-0000-0000-0000000000c1', true) $$, '42501', null,
  'a member cannot approve');
select throws_ok($$ select public.admin_reject_signup('00000000-0000-0000-0000-0000000000b1') $$, '42501', null,
  'a member cannot reject');
select throws_ok($$ select public.admin_record_help_link('00000000-0000-0000-0000-0000000000b1') $$, '42501', null,
  'a member cannot record admin actions');
select is((select count(*) from public.admin_actions), 0::bigint, 'a member sees no audit rows');
select throws_ok($$ update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-0000000000c1' $$, '42501', null,
  'nobody makes themselves an admin');

-- As someone who lost their membership above (b1) ------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$ select public.admin_set_member('00000000-0000-0000-0000-0000000000b1', true) $$, '42501', null,
  'someone without membership cannot approve themselves');

-- Signed out -----------------------------------------------------------------------------------------
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '', true);
select throws_ok($$ select * from public.admin_list_people() $$, '42501', null, 'signed out: no access to the admin functions');

select * from finish();
rollback;
