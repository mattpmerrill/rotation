-- Market data shared by every user. Read-only to signed-in users; the engine
-- writes with the service role (which bypasses RLS). Portfolio tables come in
-- Phase 1, after the backtest results settle what they need to hold.

create table public.coins (
  id          text primary key,              -- CoinGecko id: the identity of a coin
  symbol      text not null,
  name        text not null,
  categories  text[] not null default '{}',
  is_excluded boolean not null default false, -- stablecoin / wrapped / LST, per config/universe.yaml
  is_meme     boolean not null default false,
  updated_at  timestamptz not null default now()
);

-- Binance tickers get reused (LUNAUSDT = Terra Classic until 2022-05, Terra 2.0 after),
-- so a ticker maps to a coin only for a date range.
create table public.exchange_symbols (
  exchange   text not null,
  symbol     text not null,
  coin_id    text not null references public.coins (id),
  valid_from date not null,
  valid_to   date,                               -- null = still valid
  primary key (exchange, symbol, valid_from)
);

create table public.daily_prices (
  coin_id        text not null references public.coins (id),
  date           date not null,                  -- UTC day; values are that day's close
  open           double precision,
  high           double precision,
  low            double precision,
  close          double precision not null,
  volume_usd     double precision,
  market_cap_usd double precision,
  rank           integer,                        -- point-in-time rank among non-excluded coins
  source         text not null,
  primary key (coin_id, date)
);
create index daily_prices_date_rank on public.daily_prices (date, rank);

create table public.derivatives_daily (
  coin_id    text not null references public.coins (id),
  date       date not null,
  funding_8h double precision,
  oi_usd     double precision,
  source     text not null,
  primary key (coin_id, date)
);

create table public.btc_onchain (
  date             date primary key,
  market_cap_usd   double precision,
  realized_cap_usd double precision,
  mvrv             double precision
);

-- Every engine output stores the config hash it ran with; this is the lookup.
create table public.config_versions (
  hash       text primary key,
  version    integer not null,
  rules      jsonb not null,
  universe   jsonb not null,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['coins','exchange_symbols','daily_prices','derivatives_daily',
                           'btc_onchain','config_versions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "signed-in read" on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;
