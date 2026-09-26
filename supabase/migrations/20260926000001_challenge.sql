-- The 1 BTC Challenge (Matt, 2026-09-26). Supersedes the cycle-harvest plan tables
-- (plans, trades, holdings, actions, cycle_state), which the app no longer uses. They stay
-- until Matt approves dropping them.
--
-- A challenge runs one market cycle. Each member starts an entry when they choose: up to
-- 1 BTC swapped into a basket of 2-8 alts. They hold, sell the alts for USDT near the top,
-- and rebuy BTC in the bear. The score is BTC out / BTC in. The challenge ends when every
-- entry has rebought; then the next one can open.
--
-- Access: only members (profiles.is_member, set by Matt) see the challenge, and members
-- see everything in it (Matt, 2026-09-26: an open competition). Each person writes only
-- their own entry and trades. The database enforces the rules that keep it fair: the
-- 1 BTC cap, basket size, and that nobody spends more than their entry holds.

-- 1. Members ----------------------------------------------------------------------------------
alter table public.profiles add column is_member boolean not null default false;

-- A person could otherwise make themselves a member: only the display name is editable.
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

create function public.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_member from public.profiles p where p.id = (select auth.uid())), false)
$$;
revoke execute on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;

create policy "members see each other" on public.profiles
  for select to authenticated using ((select public.is_member()));

-- 2. Challenges and entries -------------------------------------------------------------------
create table public.challenges (
  id         bigint generated always as identity primary key,
  name       text not null,
  opened_on  date not null default current_date,
  closed_on  date check (closed_on is null or closed_on >= opened_on),
  created_at timestamptz not null default now()
);
-- At most one open challenge at a time.
create unique index challenges_one_open on public.challenges ((true)) where closed_on is null;

create table public.entries (
  id           bigint generated always as identity primary key,
  challenge_id bigint not null references public.challenges (id),
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  started_on   date not null,
  btc_in       numeric not null check (btc_in > 0 and btc_in <= 1),
  basket       text[] not null check (cardinality(basket) between 2 and 8),
  created_at   timestamptz not null default now(),
  unique (challenge_id, user_id)
);
create index entries_user on public.entries (user_id);

-- Every trade, against USDT at price_usd. The entry opens holding btc_in BTC; USDT is the
-- cash leg of each buy and sell (fees in USD come out of it).
--   sell bitcoin   the buy-in (BTC -> USDT)
--   buy <alt>      into the basket
--   sell <alt>     near the top
--   buy bitcoin    the rebuy
create table public.entry_trades (
  id         bigint generated always as identity primary key,
  entry_id   bigint not null references public.entries (id) on delete cascade,
  traded_on  date not null,
  asset      text not null references public.coins (id),
  side       text not null check (side in ('buy', 'sell')),
  qty        numeric not null check (qty > 0),
  price_usd  numeric not null check (price_usd > 0),
  fee_usd    numeric not null default 0 check (fee_usd >= 0),
  note       text check (char_length(note) <= 280),
  created_at timestamptz not null default now()
);
create index entry_trades_entry_date on public.entry_trades (entry_id, traded_on);
create index entry_trades_asset on public.entry_trades (asset);

-- Balances per entry and asset, including the opening BTC and the USDT leg of every trade.
-- security_invoker: runs with the caller's rights, so RLS applies.
create view public.entry_balances with (security_invoker = true) as
with legs as (
  select id as entry_id, 'bitcoin' as asset, btc_in as qty from public.entries
  union all
  select entry_id, asset, case side when 'buy' then qty else -qty end from public.entry_trades
  union all
  select entry_id, 'usdt',
         case side when 'buy' then -(qty * price_usd) - fee_usd else (qty * price_usd) - fee_usd end
  from public.entry_trades
)
select entry_id, asset, sum(qty) as qty from legs group by entry_id, asset;

-- 3. Fairness rules, checked when the transaction commits (so a buy-in's sell and buys can
-- be written in any order) -------------------------------------------------------------------
create function public.check_entry_trade() returns trigger
language plpgsql set search_path = '' as $$
declare
  e public.entries;
  bad record;
begin
  if tg_op = 'DELETE' then
    select * into e from public.entries where id = old.entry_id;
    if not found then return null; end if;  -- the entry itself was deleted (cascade)
  else
    select * into e from public.entries where id = new.entry_id;
    if new.traded_on < e.started_on then
      raise exception 'A trade can''t be dated before the buy-in (%)', e.started_on using errcode = '23514';
    end if;
    if new.traded_on > current_date then
      raise exception 'A trade can''t be dated in the future' using errcode = '23514';
    end if;
    if new.side = 'buy' and new.asset <> 'bitcoin' and not new.asset = any (e.basket) then
      raise exception '% isn''t in this basket', new.asset using errcode = '23514';
    end if;
  end if;

  -- Nobody spends or sells more than the entry holds (USDT gets a cent of rounding room).
  select b.asset, b.qty into bad from public.entry_balances b
  where b.entry_id = e.id and b.qty < case b.asset when 'usdt' then -0.01 else -1e-9 end
  limit 1;
  if found then
    raise exception 'That would leave % % in this entry', round(bad.qty, 8), bad.asset
      using errcode = '23514';
  end if;
  return null;
end $$;

create constraint trigger entry_trades_keep_entry_valid
  after insert or update or delete on public.entry_trades
  deferrable initially deferred
  for each row execute function public.check_entry_trade();

-- 4. Starting an entry: the entry and its buy-in trades in one transaction ----------------------
-- p_trades: [{"asset": "solana", "side": "buy", "qty": 1.2, "price_usd": 120, "fee_usd": 1.4}, ...]
create function public.start_entry(p_started_on date, p_btc_in numeric, p_basket text[], p_trades jsonb)
returns bigint
language plpgsql set search_path = '' as $$
declare
  cid bigint;
  eid bigint;
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

  insert into public.entries (challenge_id, started_on, btc_in, basket)
  values (cid, p_started_on, p_btc_in, p_basket)
  returning id into eid;

  insert into public.entry_trades (entry_id, traded_on, asset, side, qty, price_usd, fee_usd)
  select eid, p_started_on, t.asset, t.side, t.qty, t.price_usd, coalesce(t.fee_usd, 0)
  from jsonb_to_recordset(p_trades) as t(asset text, side text, qty numeric, price_usd numeric, fee_usd numeric);

  return eid;
end $$;
revoke execute on function public.start_entry(date, numeric, text[], jsonb) from public, anon;
grant execute on function public.start_entry(date, numeric, text[], jsonb) to authenticated;

-- Daily closes for a few coins as one row per coin (the API caps responses at 1,000 rows;
-- a year of prices for a basket is several thousand).
create function public.price_series(p_coins text[], p_from date)
returns table (coin_id text, dates date[], closes double precision[])
language sql stable set search_path = '' as $$
  select d.coin_id, array_agg(d.date order by d.date), array_agg(d.close order by d.date)
  from public.daily_prices d
  where d.coin_id = any (p_coins) and d.date >= p_from
  group by d.coin_id
$$;
revoke execute on function public.price_series(text[], date) from public, anon;
grant execute on function public.price_series(text[], date) to authenticated, service_role;

-- 5. Market state for the app (written daily by the engine) -------------------------------------
create table public.market_state (
  day                date primary key,
  btc_price          double precision not null,
  ath                double precision not null,
  ath_date           date not null,
  drawdown           double precision not null,
  days_since_ath     integer not null,
  mvrv               double precision,
  days_since_halving integer not null,
  rebuy_window_open  boolean not null,   -- the bear rebuy rule (config/rules.yaml cycle.buy)
  config_hash        text not null,
  created_at         timestamptz not null default now()
);

-- Notifications already sent, so the daily job posts each one once.
create table public.notifications (
  key     text primary key,               -- e.g. 'rebuy-window:2026-10-14', 'digest:2026-10-04'
  sent_at timestamptz not null default now()
);

-- 6. Privileges (explicit: never rely on a project's default grants) and row-level security --------

revoke all on public.challenges, public.entries, public.entry_trades, public.entry_balances,
  public.market_state, public.notifications from anon, authenticated;
grant select on public.profiles, public.coins, public.daily_prices to authenticated;
grant select on public.challenges, public.entry_balances, public.market_state to authenticated;
grant select, insert on public.entries to authenticated;
grant select, insert, delete on public.entry_trades to authenticated;
grant all on public.challenges, public.entries, public.entry_trades, public.entry_balances,
  public.market_state, public.notifications to service_role;
-- The web app's daily job (secret key) reads everything it needs to value entries.
grant select on public.profiles, public.coins, public.daily_prices to service_role;

alter table public.challenges enable row level security;
alter table public.entries enable row level security;
alter table public.entry_trades enable row level security;
alter table public.market_state enable row level security;
alter table public.notifications enable row level security;  -- no policies: the job's secret key only

create policy "members read challenges" on public.challenges
  for select to authenticated using ((select public.is_member()));

create policy "members read entries" on public.entries
  for select to authenticated using ((select public.is_member()));
create policy "members start their own entry" on public.entries
  for insert to authenticated
  with check ((select public.is_member()) and user_id = (select auth.uid()));

create policy "members read trades" on public.entry_trades
  for select to authenticated using ((select public.is_member()));
create policy "members log their own trades" on public.entry_trades
  for insert to authenticated
  with check ((select public.is_member()) and exists (
    select 1 from public.entries e where e.id = entry_id and e.user_id = (select auth.uid())));
create policy "members delete their own trades" on public.entry_trades
  for delete to authenticated
  using ((select public.is_member()) and exists (
    select 1 from public.entries e where e.id = entry_id and e.user_id = (select auth.uid())));

create policy "signed-in read" on public.market_state
  for select to authenticated using (true);

-- 7. The first challenge --------------------------------------------------------------------------
insert into public.challenges (name, opened_on) values ('1 BTC → ??', '2026-09-26');
