-- Validate the two store_activity CHECKs re-added NOT VALID by
-- 20261027170000 (strict supersets). Separate transaction: VALIDATE scans
-- under SHARE UPDATE EXCLUSIVE, activity writes continue meanwhile.
set lock_timeout = '3s';

alter table public.store_activity validate constraint store_activity_flags_ck;
alter table public.store_activity validate constraint store_activity_subject_type_ck;
