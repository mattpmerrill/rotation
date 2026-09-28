-- People, their plans and trade logs (private, per person), plus the shared daily cycle
-- state and each person's computed actions. Row-level security: a person reads and writes
-- only their own rows; everyone (even signed out) reads the cycle state for the public
-- cycle clock. The engine writes cycle_state and actions with the service role.

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

-- A profile row for every new sign-up (email/password or Google).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- The plan: how much BTC stays in the core, how much goes to the alt basket, which five.
create table public.plans (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  alt_budget_btc numeric not null default 0 check (alt_budget_btc >= 0),
  sell_btc_frac  numeric not null default 0.5 check (sell_btc_frac between 0 and 1),
  sell_alt_frac  numeric not null default 1.0 check (sell_alt_frac between 0 and 1),
  basket         text[] not null default '{}' check (cardinality(basket) <= 5),
  updated_at     timestamptz not null default now()
);

-- Every trade the person actually made. Holdings are derived from this log.
--   deposit/withdraw: an opening balance or a transfer (no USDT leg)
--   buy/sell: against USDT at price_usd; fees in USD reduce the USDT balance
-- plan_step ties a trade to the step it carried out (e.g. 'alt_slice_2', 'btc_sell_3',
-- 'rebuy_1') so the engine knows what is already done this cycle.
create table public.trades (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  traded_on  date not null,
  asset      text not null,                         -- 'bitcoin', 'usdt' or a CoinGecko id
  side       text not null check (side in ('buy', 'sell', 'deposit', 'withdraw')),
  qty        numeric not null check (qty > 0),
  price_usd  numeric check (price_usd is null or price_usd > 0),
  fee_usd    numeric not null default 0 check (fee_usd >= 0),
  plan_step  text,
  note       text,
  created_at timestamptz not null default now(),
  check (side in ('deposit', 'withdraw') or price_usd is not null)
);
create index trades_user_date on public.trades (user_id, traded_on);

-- Holdings per person and asset, including the USDT leg of every buy and sell.
-- security_invoker: the view runs with the caller's rights, so RLS on trades applies.
create view public.holdings with (security_invoker = true) as
with legs as (
  select user_id, asset,
         case when side in ('buy', 'deposit') then qty else -qty end as qty
  from public.trades
  union all
  select user_id, 'usdt',
         case side when 'buy' then -(qty * price_usd) - fee_usd
                   when 'sell' then (qty * price_usd) - fee_usd end
  from public.trades
  where side in ('buy', 'sell')
)
select user_id, asset, sum(qty) as qty
from legs
group by user_id, asset
having abs(sum(qty)) > 1e-12;

-- Shared daily cycle state, written by the engine. Public: it contains no holdings.
create table public.cycle_state (
  day                date primary key,
  btc_price          double precision not null,
  ath                double precision not null,
  ath_date           date not null,
  drawdown           double precision not null,
  days_since_ath     integer not null,
  mvrv               double precision,
  last_halving       date not null,
  days_since_halving integer not null,
  next_halving_est   date not null,
  phase              text not null,
  upcoming           jsonb not null default '[]',
  config_hash        text not null,
  created_at         timestamptz not null default now()
);

-- What the rules say each person should do, per day, with exact amounts (private).
create table public.actions (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  day       date not null,
  kind      text not null check (kind in ('buy', 'sell')),
  asset     text not null,
  qty       numeric,
  usd       numeric,
  plan_step text not null,
  reason    text not null,
  share     text not null,
  unique (user_id, day, plan_step, asset)
);

alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.trades enable row level security;
alter table public.cycle_state enable row level security;
alter table public.actions enable row level security;

create policy "own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "update own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "own plan" on public.plans
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own trades" on public.trades
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own actions" on public.actions
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "anyone reads the cycle state" on public.cycle_state
  for select to anon, authenticated using (true);

create index actions_user_day on public.actions (user_id, day);
