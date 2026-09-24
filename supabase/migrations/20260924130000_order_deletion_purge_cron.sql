-- Run the order-deletion purge from the database itself (pg_cron) instead of a
-- Vercel cron hitting an HTTP route: no secret to guard, no route to expose,
-- and it keeps running whatever state the web deploy is in.
--
-- Hourly rather than daily so "erased after 7 days" holds to the hour, and so
-- unused 30-minute export tickets drop their order lists promptly. The purge
-- is a no-op when nothing is due.

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

-- Idempotent: a re-run replaces the job rather than scheduling a second one.
select cron.unschedule(jobid) from cron.job where jobname = 'order-deletion-purge';
select cron.schedule('order-deletion-purge', '0 * * * *', $$select public.purge_order_deletions()$$);
