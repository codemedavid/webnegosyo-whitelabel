-- "Texts are waiting" push: when automated texts are due but the store's
-- sending phone has not checked in for a while, the owner's phones get ONE
-- push (at most every 12 hours). The tick claims the alert with a conditional
-- UPDATE on this column, so concurrent ticks never double-notify.

alter table public.sms_settings add column if not exists waiting_alert_at timestamptz;

-- Rollback: alter table public.sms_settings drop column waiting_alert_at;
