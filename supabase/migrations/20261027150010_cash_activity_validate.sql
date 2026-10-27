-- Validate the two store_activity CHECKs re-added NOT VALID by
-- 20261027150000 (strict supersets of what every existing row passed).
-- A separate migration = a separate transaction: VALIDATE scans under SHARE
-- UPDATE EXCLUSIVE, so activity writes continue meanwhile (as 20261022120210).
set lock_timeout = '3s';

alter table public.store_activity validate constraint store_activity_flags_ck;
alter table public.store_activity validate constraint store_activity_subject_type_ck;
