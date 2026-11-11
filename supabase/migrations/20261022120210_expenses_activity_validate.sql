-- Expenses — validate the two widened store_activity CHECKs
--
-- 20261022120200 re-added store_activity_category_ck (+ 'expenses') and
-- store_activity_subject_type_ck (+ 'expense') NOT VALID. Validating in its
-- own transaction scans the ~77k existing rows under SHARE UPDATE EXCLUSIVE,
-- so the hot activity triggers keep writing meanwhile. Both lists are strict
-- supersets of the old ones, so every existing row passes.

set lock_timeout = '3s';

alter table public.store_activity validate constraint store_activity_category_ck;
alter table public.store_activity validate constraint store_activity_subject_type_ck;

reset lock_timeout;

-- Rollback: nothing to undo (a validated CHECK is the same CHECK).
