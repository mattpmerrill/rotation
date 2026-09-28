-- handle_new_user runs only from the auth.users trigger; nobody should call it via the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
create index exchange_symbols_coin_id on public.exchange_symbols (coin_id);
