-- Waiting slots (Matt, 2026-09-26). At the buy-in, some of a person's 2-8 picks can be
-- waiting slots: each keeps an equal share of the BTC as BTC. Later, before any rebuy, a slot
-- can be filled with a coin: exactly one slot's share of BTC is sold and the coin joins the
-- basket. A slot never filled just stays BTC.
--
-- Every trade now has a kind, and people log only the kinds that are theirs to log:
--   buy_in   the start (BTC sold, basket bought)      -> start_entry() only
--   fill     a slot filled (BTC sold, coin bought)    -> fill_slot() only
--   sell     an alt sold for USDT                     -> the person
--   rebuy    BTC bought with USDT                     -> the person
-- So nobody can move BTC or USDT into alts outside the buy-in and the slots.

-- 1. Slots on entries ---------------------------------------------------------------------------
alter table public.entries add column open_slots integer not null default 0 check (open_slots >= 0);
alter table public.entries drop constraint entries_basket_check;
alter table public.entries add constraint entries_picks_check
  check (cardinality(basket) >= 1 and cardinality(basket) + open_slots between 2 and 8);

-- 2. Trade kinds --------------------------------------------------------------------------------------
-- Check balances as the backfill runs, so no checks are pending when the table is altered.
set constraints public.entry_trades_keep_entry_valid immediate;
alter table public.entry_trades add column kind text;
update public.entry_trades t set kind = case
    when t.side = 'buy' and t.asset = 'bitcoin' then 'rebuy'
    when t.side = 'sell' and t.asset <> 'bitcoin' then 'sell'
    else 'buy_in' end;
alter table public.entry_trades alter column kind set not null;
alter table public.entry_trades add constraint entry_trades_kind_check check (
  (kind = 'sell' and side = 'sell' and asset <> 'bitcoin') or
  (kind = 'rebuy' and side = 'buy' and asset = 'bitcoin') or
  (kind in ('buy_in', 'fill') and ((side = 'sell' and asset = 'bitcoin') or (side = 'buy' and asset <> 'bitcoin')))
);

drop policy "members log their own trades" on public.entry_trades;
create policy "members log their own sells and rebuys" on public.entry_trades
  for insert to authenticated
  with check ((select public.is_member()) and kind in ('sell', 'rebuy') and exists (
    select 1 from public.entries e where e.id = entry_id and e.user_id = (select auth.uid())));
drop policy "members delete their own trades" on public.entry_trades;
create policy "members delete their own sells and rebuys" on public.entry_trades
  for delete to authenticated
  using ((select public.is_member()) and kind in ('sell', 'rebuy') and exists (
    select 1 from public.entries e where e.id = entry_id and e.user_id = (select auth.uid())));

-- 3. Starting an entry, now with slots --------------------------------------------------------------
-- Security definer: it writes buy_in trades, which people can't insert directly. It checks the
-- caller itself: a member, starting their own entry in the open challenge.
drop function public.start_entry(date, numeric, text[], jsonb);
create function public.start_entry(p_started_on date, p_btc_in numeric, p_basket text[], p_slots integer, p_trades jsonb)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  cid bigint;
  eid bigint;
  sold numeric;
begin
  if not (select public.is_member()) then
    raise exception 'Only challenge members can start an entry' using errcode = '42501';
  end if;
  select id into cid from public.challenges where closed_on is null;
  if cid is null then
    raise exception 'No challenge is open right now' using errcode = 'P0002';
  end if;
  if p_started_on < (select opened_on from public.challenges where id = cid) then
    raise exception 'The buy-in can''t be before the challenge opened' using errcode = '23514';
  end if;

  -- the buy-in sells the BTC for the coins and keeps each slot's share as BTC
  select coalesce(sum(t.qty), 0) into sold
  from jsonb_to_recordset(p_trades) as t(asset text, side text, qty numeric)
  where t.asset = 'bitcoin' and t.side = 'sell';
  if abs(sold - p_btc_in * cardinality(p_basket) / (cardinality(p_basket) + p_slots)) > 1e-8 then
    raise exception 'The buy-in must sell % BTC and keep the rest for the waiting slots',
      round(p_btc_in * cardinality(p_basket) / (cardinality(p_basket) + p_slots), 8) using errcode = '23514';
  end if;

  insert into public.entries (challenge_id, user_id, started_on, btc_in, basket, open_slots)
  values (cid, (select auth.uid()), p_started_on, p_btc_in, p_basket, p_slots)
  returning id into eid;

  insert into public.entry_trades (entry_id, traded_on, asset, side, qty, price_usd, fee_usd, kind)
  select eid, p_started_on, t.asset, t.side, t.qty, t.price_usd, coalesce(t.fee_usd, 0), 'buy_in'
  from jsonb_to_recordset(p_trades) as t(asset text, side text, qty numeric, price_usd numeric, fee_usd numeric);

  return eid;
end $$;
revoke execute on function public.start_entry(date, numeric, text[], integer, jsonb) from public, anon;
grant execute on function public.start_entry(date, numeric, text[], integer, jsonb) to authenticated;

-- 4. Filling a slot -------------------------------------------------------------------------------------
-- p_trades: the BTC sale (exactly one slot's share of the waiting BTC) and the coin buy.
create function public.fill_slot(p_entry_id bigint, p_traded_on date, p_coin text, p_trades jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.entries;
  waiting numeric;
  share numeric;
  sold numeric;
begin
  select * into e from public.entries where id = p_entry_id for update;
  if not found or e.user_id <> (select auth.uid()) or not (select public.is_member()) then
    raise exception 'You can only fill slots in your own basket' using errcode = '42501';
  end if;
  if e.open_slots < 1 then
    raise exception 'This basket has no waiting slots' using errcode = '23514';
  end if;
  if exists (select 1 from public.entry_trades where entry_id = e.id and kind = 'rebuy') then
    raise exception 'Slots can''t be filled after rebuying BTC' using errcode = '23514';
  end if;
  if p_coin = 'bitcoin' or p_coin = any (e.basket) then
    raise exception '% is already in the basket', p_coin using errcode = '23514';
  end if;

  select coalesce(sum(qty), 0) into waiting from public.entry_balances where entry_id = e.id and asset = 'bitcoin';
  share := waiting / e.open_slots;
  select coalesce(sum(t.qty), 0) into sold
  from jsonb_to_recordset(p_trades) as t(asset text, side text, qty numeric)
  where t.asset = 'bitcoin' and t.side = 'sell';
  if abs(sold - share) > 1e-8 then
    raise exception 'Filling a slot sells exactly one slot''s share: % BTC', round(share, 8) using errcode = '23514';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_trades) as t(asset text, side text)
             where not ((t.asset = 'bitcoin' and t.side = 'sell') or (t.asset = p_coin and t.side = 'buy'))) then
    raise exception 'A fill sells BTC and buys %, nothing else', p_coin using errcode = '23514';
  end if;

  update public.entries set basket = basket || p_coin, open_slots = open_slots - 1 where id = e.id;
  insert into public.entry_trades (entry_id, traded_on, asset, side, qty, price_usd, fee_usd, kind)
  select e.id, p_traded_on, t.asset, t.side, t.qty, t.price_usd, coalesce(t.fee_usd, 0), 'fill'
  from jsonb_to_recordset(p_trades) as t(asset text, side text, qty numeric, price_usd numeric, fee_usd numeric);
end $$;
revoke execute on function public.fill_slot(bigint, date, text, jsonb) from public, anon;
grant execute on function public.fill_slot(bigint, date, text, jsonb) to authenticated;

-- The picks (coins + slots) rule moved to entries_picks_check; the trade trigger still checks
-- dates, basket membership and balances for every kind.
