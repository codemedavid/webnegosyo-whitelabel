-- Tender validation reads the quote before the settlement RPC locks it.
-- Never mutate/reuse that quote ID: otherwise the RPC could consume a reward
-- for a different total, policy, cashier, reservation or branch than validated.
-- Repricing creates a NEW quote. Expiry is a timestamp check, not an update.
create or replace function public.reject_loyalty_quote_mutation()
returns trigger language plpgsql set search_path=public as $$
begin
  raise exception 'Loyalty quotes are immutable; create a new quote';
end;
$$;

-- Also refuse deletion: deleting and reinserting the same ID would bypass an
-- update-only guard. A future retention process must preserve receipt recovery
-- and explicitly coordinate privileged archival; ordinary service-role callers
-- cannot delete either unused or settled quotes.
create trigger loyalty_pos_quotes_immutable
before update or delete on public.loyalty_pos_quotes
for each row execute function public.reject_loyalty_quote_mutation();

-- TRUNCATE does not invoke row triggers (including a cascading truncation).
create trigger loyalty_pos_quotes_no_truncate
before truncate on public.loyalty_pos_quotes
for each statement execute function public.reject_loyalty_quote_mutation();

revoke truncate on public.loyalty_pos_quotes, public.loyalty_pos_settlements,
  public.loyalty_pos_projection_jobs from service_role;

revoke all on function public.reject_loyalty_quote_mutation() from public,anon,authenticated;
