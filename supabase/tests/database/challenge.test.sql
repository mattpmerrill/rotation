-- The 1 Bitty Challenge: access rules and fairness rules. Run: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

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

-- A valid buy-in at BTC $100k, SOL $200, LINK $20, 1% fee on the sale: the coins' share of the
-- BTC is sold and the USDT split equally; each waiting slot keeps its share as BTC.
create function pg_temp.buy_in(btc numeric, basket text[], slots integer default 0) returns bigint
language sql as $$
  with s as (select btc * cardinality(basket) / (cardinality(basket) + slots) as sold)
  select public.start_entry(current_date, btc, basket, slots, jsonb_build_array(
    jsonb_build_object('asset', 'bitcoin', 'side', 'sell', 'qty', s.sold, 'price_usd', 100000, 'fee_usd', s.sold * 1000),
    jsonb_build_object('asset', 'solana', 'side', 'buy', 'qty', s.sold * 99000 / cardinality(basket) / 200, 'price_usd', 200),
    jsonb_build_object('asset', 'chainlink', 'side', 'buy', 'qty', s.sold * 99000 / cardinality(basket) / 20, 'price_usd', 20)))
  from s
$$;
grant execute on function pg_temp.buy_in(numeric, text[], integer) to authenticated;

create function pg_temp.entry_of(uid text) returns bigint language sql as $$
  select id from public.entries where user_id = uid::uuid
$$;
grant execute on function pg_temp.entry_of(text) to authenticated;

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
  'a basket needs at least 2 picks');
select throws_ok($$ select pg_temp.buy_in(1, array['a','b','c','d','e','f','g','h','i']) $$, '23514', null,
  'a basket has at most 8 picks');
select throws_ok($$ select public.start_entry(current_date, 1, array['solana', 'chainlink'], 0, jsonb_build_array(
    jsonb_build_object('asset', 'bitcoin', 'side', 'sell', 'qty', 1, 'price_usd', 100000),
    jsonb_build_object('asset', 'solana', 'side', 'buy', 'qty', 600, 'price_usd', 200))) $$,
  '23514', null, 'a buy-in cannot spend more USDT than the BTC it sold');
select lives_ok($$ select pg_temp.buy_in(1, array['solana', 'chainlink']) $$, 'a valid buy-in works');
create temp table ids as select id from public.entries where user_id = '00000000-0000-0000-0000-00000000000a';
grant select on ids to authenticated;
select throws_ok($$ select pg_temp.buy_in(1, array['solana', 'chainlink']) $$, '23505', null,
  'one entry per person per challenge');
select is((select round(qty, 2) from public.entry_balances where asset = 'usdt' and entry_id in (select id from ids)),
  0.00::numeric, 'the buy-in leaves no USDT');

-- Trades after the buy-in ------------------------------------------------------------------------------
select throws_ok($$ insert into public.entry_trades (entry_id, traded_on, asset, side, qty, price_usd, kind)
    select id, current_date, 'solana', 'sell', 300, 250, 'sell' from ids $$, '23514', null,
  'cannot sell more than you hold');
select throws_ok($$ insert into public.entry_trades (entry_id, traded_on, asset, side, qty, price_usd, kind)
    select id, current_date, 'solana', 'buy', 1, 200, 'sell' from ids $$, '23514', null,
  'cannot buy alts outside the buy-in and slot fills');
select throws_ok($$ insert into public.entry_trades (entry_id, traded_on, asset, side, qty, price_usd, kind)
    select id, current_date, 'solana', 'buy', 1, 200, 'buy_in' from ids $$, '42501', null,
  'cannot log buy-in trades directly');
select throws_ok($$ insert into public.entry_trades (entry_id, traded_on, asset, side, qty, price_usd, kind)
    select id, current_date - 1, 'solana', 'sell', 1, 250, 'sell' from ids $$, '23514', null,
  'cannot date a trade before the buy-in');
select lives_ok($$ insert into public.entry_trades (entry_id, traded_on, asset, side, qty, price_usd, fee_usd, kind)
    select id, current_date, 'solana', 'sell', 100, 250, 250, 'sell' from ids $$, 'a partial sell works');
select is((select round(qty, 2) from public.entry_balances where asset = 'usdt' and entry_id in (select id from ids)),
  24750.00::numeric, 'the sell lands in USDT, less the fee');
delete from public.entry_trades where kind = 'buy_in' and entry_id in (select id from ids);
select is((select count(*) from public.entry_trades where entry_id in (select id from ids)), 4::bigint,
  'buy-in trades cannot be deleted');

-- Another member sees everything but changes nothing ---------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select is((select count(*) from public.entry_trades where entry_id in (select id from ids)), 4::bigint,
  'members see each other''s trades');
select throws_ok($$ insert into public.entry_trades (entry_id, traded_on, asset, side, qty, price_usd, kind)
    select id, current_date, 'solana', 'sell', 1, 250, 'sell' from ids $$, '42501', null,
  'members cannot trade in someone else''s entry');
delete from public.entry_trades where entry_id in (select id from ids);
select is((select count(*) from public.entry_trades where entry_id in (select id from ids)), 4::bigint,
  'members cannot delete someone else''s trades');

-- Waiting slots: B picks SOL and LINK plus two slots, so half the BTC waits -----------------------------
select throws_ok($$ select public.start_entry(current_date, 1, array['solana', 'chainlink'], 2, jsonb_build_array(
    jsonb_build_object('asset', 'bitcoin', 'side', 'sell', 'qty', 1, 'price_usd', 100000))) $$,
  '23514', null, 'the buy-in keeps each slot''s share as BTC');
select lives_ok($$ select pg_temp.buy_in(1, array['solana', 'chainlink'], 2) $$, 'a buy-in with two slots works');
select is((select round(qty, 8) from public.entry_balances
           where asset = 'bitcoin' and entry_id = pg_temp.entry_of('00000000-0000-0000-0000-00000000000b')),
  0.5::numeric, 'half the BTC waits for the two slots');

create function pg_temp.fill(coin text, btc numeric) returns void language sql as $$
  select public.fill_slot(pg_temp.entry_of('00000000-0000-0000-0000-00000000000b'), current_date, coin, jsonb_build_array(
    jsonb_build_object('asset', 'bitcoin', 'side', 'sell', 'qty', btc, 'price_usd', 100000),
    jsonb_build_object('asset', coin, 'side', 'buy', 'qty', btc * 100000 / 0.1, 'price_usd', 0.1)))
$$;
grant execute on function pg_temp.fill(text, numeric) to authenticated;

select throws_ok($$ select pg_temp.fill('solana', 0.25) $$, '23514', null, 'a slot takes a coin not already held');
select throws_ok($$ select pg_temp.fill('dogecoin', 0.5) $$, '23514', null,
  'a fill sells exactly one slot''s share, no more');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select throws_ok($$ select pg_temp.fill('dogecoin', 0.25) $$, '42501', null, 'nobody fills someone else''s slot');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select lives_ok($$ select pg_temp.fill('dogecoin', 0.25) $$, 'filling a slot works');
select is((select basket || array[open_slots::text] from public.entries
           where id = pg_temp.entry_of('00000000-0000-0000-0000-00000000000b')),
  array['solana', 'chainlink', 'dogecoin', '1'], 'the coin joins the basket and one slot is left');

-- after a rebuy, the last slot can't be filled
insert into public.entry_trades (entry_id, traded_on, asset, side, qty, price_usd, kind)
  values (pg_temp.entry_of('00000000-0000-0000-0000-00000000000b'), current_date, 'solana', 'sell', 10, 200, 'sell'),
         (pg_temp.entry_of('00000000-0000-0000-0000-00000000000b'), current_date, 'bitcoin', 'buy', 0.01, 100000, 'rebuy');
select throws_ok($$ select public.fill_slot(pg_temp.entry_of('00000000-0000-0000-0000-00000000000b'), current_date,
    'chainlink', '[]'::jsonb) $$, '23514', 'Slots can''t be filled after rebuying BTC',
  'slots close once rebuying starts');

select lives_ok($$ select * from public.price_series(array['solana'], current_date - 1) $$,
  'members can read price series');

-- Signed out: nothing ----------------------------------------------------------------------------
select set_config('role', 'anon', true);
select throws_ok($$ select count(*) from public.entries $$, '42501', null, 'signed out: no access');
select throws_ok($$ select public.fill_slot(1, current_date, 'x', '[]'::jsonb) $$, '42501', null,
  'signed out: cannot fill slots');

-- The daily job (secret key) reads everything it values entries with.
select set_config('role', 'service_role', true);
select lives_ok($$ select count(*) from public.profiles join public.entries e on e.user_id = profiles.id
    join public.entry_trades t on t.entry_id = e.id, public.daily_prices, public.coins, public.market_state $$,
  'the job can read entries, names, trades and prices');

select * from finish();
rollback;
