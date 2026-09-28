-- Retire the cycle-harvest plan tables (Matt approved dropping them, 2026-09-26). The app is
-- only the 1 BTC Challenge now; what they held (one plan, one opening-balance trade, the
-- per-person actions and the old cycle_state) isn't used by anything.
drop view public.holdings;
drop table public.actions;
drop table public.trades;
drop table public.plans;
drop table public.cycle_state;
