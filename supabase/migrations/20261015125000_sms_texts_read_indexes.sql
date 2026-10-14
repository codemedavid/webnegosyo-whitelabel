-- Indexes for the web Texts reads (review of 574f3317, DB findings H1–H3).
--
-- H1 sms_outbox "recently texted" (audience-inputs) + the 30-day line filter
--    status='sent' and sent_at >= since per store: no index served the sent_at arm.
-- H2 list_sms_sender_devices' per-phone lateral over loyalty_sms_outbox (and the
--    existing claim function) look up claimed_by_device + created_at.
-- H3 the audience guest read pages smsable guests by id (keyset).
--
-- Applied as plain CREATE INDEX: the tables were tiny on 2026-10-14
-- (customers 1,885 rows; sms_outbox / loyalty_sms_outbox empty). On a large
-- table use CREATE INDEX CONCURRENTLY outside a transaction instead.

create index if not exists sms_outbox_sent_at_idx
  on public.sms_outbox(tenant_id, sent_at desc) where status = 'sent';

create index if not exists loyalty_sms_outbox_device_recent_idx
  on public.loyalty_sms_outbox(claimed_by_device, created_at desc) where claimed_by_device is not null;

create index if not exists customers_tenant_smsable_id_idx
  on public.customers(tenant_id, id)
  where sms_consent = true and sms_opt_out = false and phone_e164 is not null;

-- PROBE: select indexname from pg_indexes where indexname in
--   ('sms_outbox_sent_at_idx','loyalty_sms_outbox_device_recent_idx','customers_tenant_smsable_id_idx');  -- 3 rows
