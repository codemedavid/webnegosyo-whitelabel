-- Applied to platform 2026-11-10 as version 20261110112841 (file named to match).
--
-- Meta (Facebook) ad attribution for funnel leads.
--
-- meta_attribution: what the buyer's browser handed the order form (the _fbp
-- / _fbc cookies, user agent, page URL) plus the IP the server saw. Kept so a
-- staff "Paid" days later can send Meta a website Purchase that matches the
-- same person (a website event needs the buyer's user agent, never staff's).
-- NULL = the lead did not come through the browser (staff invite, sign-up
-- link) — no Purchase is sent for it.
--
-- meta_purchase_sent_at: the Purchase claim. Set once by a conditional
-- UPDATE (… where meta_purchase_sent_at is null) before the send, given back
-- only when the send was skipped, so a lead is reported paid at most once.
--
-- Additive only. RLS on checkout_leads is superadmin-only and every writer is
-- the service role, so the new columns are no wider than the row.
alter table public.checkout_leads
  add column if not exists meta_attribution jsonb,
  add column if not exists meta_purchase_sent_at timestamptz;

comment on column public.checkout_leads.meta_attribution is
  'Browser signals for Meta Conversions API (fbp, fbc, user agent, IP, page URL, lead event id). NULL = not a browser lead.';
comment on column public.checkout_leads.meta_purchase_sent_at is
  'When the Meta Purchase event was claimed/sent for this lead; NULL = never.';
