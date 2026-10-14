-- Store activity — validate the length CHECKs added NOT VALID in 20261012150000.
--
-- Separate file = separate statement/transaction: VALIDATE CONSTRAINT scans
-- under SHARE UPDATE EXCLUSIVE, so checkout and status updates keep flowing
-- while orders / order_status_events are checked. Both columns are new and
-- empty, so the scans find nothing to refuse.
set lock_timeout = '3s';

alter table public.orders validate constraint orders_cancel_reason_len_ck;
alter table public.order_status_events validate constraint order_status_events_reason_len_ck;
alter table public.order_status_events validate constraint order_status_events_note_len_ck;

reset lock_timeout;
