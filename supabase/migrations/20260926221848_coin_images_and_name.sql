-- Coin icons for the app (CoinGecko's image URL, refreshed by the daily job), and the
-- challenge's name (Matt, 2026-09-26: "1 Bitty Challenge").
alter table public.coins add column image_url text;

update public.challenges set name = '1 Bitty Challenge' where name = '1 BTC → ??';
