-- APPLY ONLY AFTER the release 1 + 2 web code is deployed.
--
-- PSIDs are page-scoped, so the real key is (tenant_id, psid)
-- (messenger_sessions_tenant_psid_key, 20261110120000). The code before
-- release 1 upserts onConflict 'psid' and fails (42P10) without this
-- constraint, which is why it stayed until the new code is live.
alter table public.messenger_sessions drop constraint if exists messenger_sessions_psid_key;
