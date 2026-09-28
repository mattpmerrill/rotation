-- Edit and delete a basket (Matt, 2026-09-27).
--
-- Delete: a person can delete their own entry, with all its trades, at any time. They can then
-- start a new one (one entry per person per challenge still holds).
--
-- Edit: a person can redo their own buy-in (BTC in, date, coins, slots, and the buy-in trades)
-- while the buy-in is all the entry has. Once they've sold, rebought or filled a slot, later
-- trades depend on the buy-in, so it's locked: delete those sells and rebuys first, or delete the
-- basket and start again.
--
-- Both are security definer functions that check the caller themselves, like start_entry().

-- 1. Delete ---------------------------------------------------------------------------------------
create function public.delete_entry(p_entry_id bigint)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.entries;
begin
  select * into e from public.entries where id = p_entry_id for update;
  if not found or e.user_id <> (select auth.uid()) or not (select public.is_member()) then
    raise exception 'You can only delete your own basket' using errcode = '42501';
  end if;
  delete from public.entries where id = e.id;  -- its trades go with it (on delete cascade)
end $$;
revoke execute on function public.delete_entry(bigint) from public, anon;
grant execute on function public.delete_entry(bigint) to authenticated;

-- 2. Edit -----------------------------------------------------------------------------------------
-- Same arguments and rules as start_entry(), for an existing entry.
create function public.edit_entry(
  p_entry_id bigint, p_started_on date, p_btc_in numeric, p_basket text[], p_slots integer, p_trades jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.entries;
  sold numeric;
begin
  select * into e from public.entries where id = p_entry_id for update;
  if not found or e.user_id <> (select auth.uid()) or not (select public.is_member()) then
    raise exception 'You can only edit your own basket' using errcode = '42501';
  end if;
  if exists (select 1 from public.challenges where id = e.challenge_id and closed_on is not null) then
    raise exception 'This challenge has closed' using errcode = '23514';
  end if;
  if exists (select 1 from public.entry_trades where entry_id = e.id and kind <> 'buy_in') then
    raise exception 'A basket can''t be edited after a sell, rebuy or slot fill. Delete those trades first, or delete the basket'
      using errcode = '23514';
  end if;
  if p_started_on < (select opened_on from public.challenges where id = e.challenge_id) then
    raise exception 'The buy-in can''t be before the challenge opened' using errcode = '23514';
  end if;

  select coalesce(sum(t.qty), 0) into sold
  from jsonb_to_recordset(p_trades) as t(asset text, side text, qty numeric)
  where t.asset = 'bitcoin' and t.side = 'sell';
  if abs(sold - p_btc_in * cardinality(p_basket) / (cardinality(p_basket) + p_slots)) > 1e-8 then
    raise exception 'The buy-in must sell % BTC and keep the rest for the waiting slots',
      round(p_btc_in * cardinality(p_basket) / (cardinality(p_basket) + p_slots), 8) using errcode = '23514';
  end if;

  -- Swap the old buy-in for the new one. The trade checks are deferred to commit, so the
  -- balances are only checked once the new buy-in is in.
  delete from public.entry_trades where entry_id = e.id;
  update public.entries
    set started_on = p_started_on, btc_in = p_btc_in, basket = p_basket, open_slots = p_slots
    where id = e.id;
  insert into public.entry_trades (entry_id, traded_on, asset, side, qty, price_usd, fee_usd, kind)
  select e.id, p_started_on, t.asset, t.side, t.qty, t.price_usd, coalesce(t.fee_usd, 0), 'buy_in'
  from jsonb_to_recordset(p_trades) as t(asset text, side text, qty numeric, price_usd numeric, fee_usd numeric);
end $$;
revoke execute on function public.edit_entry(bigint, date, numeric, text[], integer, jsonb) from public, anon;
grant execute on function public.edit_entry(bigint, date, numeric, text[], integer, jsonb) to authenticated;
