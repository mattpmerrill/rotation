-- The 1 Bitty Challenge: access rules and fairness rules. Run: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Deferred checks fire at commit; fire them per statement so each test sees its own error.
set constraints all immediate;

-- Fixtures: three people (two members, one outsider) and a few coins.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.dev'),
  ('00000000-0000-0000-0000-00000000000c', 'c@test.dev');
update public.profiles set is_member = true
  where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
insert into public.coins (id, symbol, name) values
  ('bitcoin', 'btc', 'Bitcoin'), ('solana', 'sol', 'Solana'),
  ('chainlink', 'link', 'Chainlink'), ('dogecoin', 'doge', 'Dogecoin')
  on conflict (id) do nothing;

create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true)
$$;

-- A valid buy-in: 1 BTC at $100k -> USDT, then $49.5k each into SOL and LINK (1% fees).
create function pg_temp.buy_in(btc numeric, basket text[]) returns bigint language sql as $$
  select public.start_entry(current_date, btc, basket, jsonb_build_array(
    jsonb_build_object('asset', 'bitcoin', 'side', 'sell', 'qty', btc, 'price_usd', 100000, 'fee_usd', 1000 * btc),
    jsonb_build_object('asset', 'solana', 'side', 'buy', 'qty', 247.5 * btc, 'price_usd', 200, 'fee_usd', 0),
    jsonb_build_object('asset', 'chainlink', 'side', 'buy', 'qty', 2475 * btc, 'price_usd', 20, 'fee_usd', 0)))
$$;
grant execute on function pg_temp.buy_in(numeric, text[]) to authenticated;

-- Outsiders see nothing and can't join ---------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select is((select count(*) from public.challenges), 0::bigint, 'outsider sees no challenge');
select is((select count(*) from public.profiles), 1::bigint, 'outsider sees only their own profile');
select throws_ok($$ select pg_temp.buy_in(1, array['solana', 'chainlink']) $$, '42501', null,
  'outsider cannot start an entry');
select throws_ok($$ update public.profiles set is_member = true $$, '42501', null,
  'nobody can make themselves a member');
select lives_ok($$ update public.profiles set display_name = 'C' $$, 'anyone can rename themselves');

-- A member starts an entry -------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select throws_ok($$ select pg_temp.buy_in(1.5, array['solana', 'chainlink']) $$, '23514', null,
  'the buy-in is capped at 1 BTC');
select throws_ok($$ select pg_temp.buy_in(1, array['solana']) $$, '23514', null,
  'a basket needs at least 2 coins');
select throws_ok($$ select pg_temp.buy_in(1, array['a','b','c','d','e','f','g','h','i']) $$, '23514', null,
  'a basket has at most 8 coins');
select throws_ok($$ select public.start_entry(current_date, 1, array['solana', 'chainlink'], jsonb_build_array(
    jsonb_build_object('asset', 'bitcoin', 'side', 'sell', 'qty', 1, 'price_usd', 100000),
    jsonb_build_object('asset', 'solana', 'side', 'buy', 'qty', 600, 'price_usd', 200))) $$,
  '23514', null, 'a buy-in cannot spend more USDT than the BTC it sold');
select lives_ok($$ select pg_temp.buy_in(1, array['solana', 'chainlink']) $$, 'a valid buy-in works');
create temp table ids as select id from public.entries where user_id = '00000000-0000-0000-0000-00000000000a';
grant select on ids to authenticated;
select throws_ok($$ select pg_temp.buy_in(1, array['solana', 'chainlink']) $$, '23505', null,
  'one entry per person per challenge');

select is((select round(qty, 2) from public.entry_balances where asset = 'usdt' and entry_id in (select id from ids)), 0.00::numeric,
  'the buy-in leaves no USDT');

-- Trades after the buy-in ------------------------------------------------------------------------------
select throws_ok($$ insert into public.entry_trades (entry_id, traded_on, asset, side, qty, price_usd)
    select id, current_date, 'solana', 'sell', 300, 250 from ids $$, '23514', null,
  'cannot sell more than you hold');
select throws_ok($$ insert into public.entry_trades (entry_id, traded_on, asset, side, qty, price_usd)
    select id, current_date, 'dogecoin', 'buy', 1, 0.1 from ids $$, '23514', null,
  'cannot buy a coin outside the basket');
select throws_ok($$ insert into public.entry_trades (entry_id, traded_on, asset, side, qty, price_usd)
    select id, current_date - 1, 'solana', 'sell', 1, 250 from ids $$, '23514', null,
  'cannot date a trade before the buy-in');
select lives_ok($$ insert into public.entry_trades (entry_id, traded_on, asset, side, qty, price_usd, fee_usd)
    select id, current_date, 'solana', 'sell', 100, 250, 250 from ids $$, 'a partial sell works');
select is((select round(qty, 2) from public.entry_balances where asset = 'usdt' and entry_id in (select id from ids)), 24750.00::numeric,
  'the sell lands in USDT, less the fee');
select throws_ok($$ delete from public.entry_trades where asset = 'bitcoin' and entry_id in (select id from ids) $$, '23514', null,
  'deleting the buy-in sell would leave negative USDT');

-- Another member sees everything but changes nothing ---------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select is((select count(*) from public.entry_trades where entry_id in (select id from ids)), 4::bigint,
  'members see each other''s trades');
select throws_ok($$ insert into public.entry_trades (entry_id, traded_on, asset, side, qty, price_usd)
    select id, current_date, 'solana', 'sell', 1, 250 from ids $$, '42501', null,
  'members cannot trade in someone else''s entry');
delete from public.entry_trades where entry_id in (select id from ids);
select is((select count(*) from public.entry_trades where entry_id in (select id from ids)), 4::bigint,
  'members cannot delete someone else''s trades');

select lives_ok($$ select * from public.price_series(array['solana'], current_date - 1) $$,
  'members can read price series');

-- Signed out: nothing ----------------------------------------------------------------------------
select set_config('role', 'anon', true);
select throws_ok($$ select count(*) from public.entries $$, '42501', null, 'signed out: no access');

-- The daily job (secret key) reads everything it values entries with.
select set_config('role', 'service_role', true);
select lives_ok($$ select count(*) from public.profiles join public.entries e on e.user_id = profiles.id
    join public.entry_trades t on t.entry_id = e.id, public.daily_prices, public.coins, public.market_state $$,
  'the job can read entries, names, trades and prices');

select * from finish();
rollback;
