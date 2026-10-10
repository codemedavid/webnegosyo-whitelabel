-- Sales pipeline: when did a checkout lead become paid, and when did it go live?
--
-- The superadmin pipeline dashboard measures "order → paid → live" times, but
-- checkout_leads only kept the CURRENT status and a shared updated_at. Two
-- first-time stamps, written by a trigger so every writer (staff status edits,
-- confirmLeadPayment, publishStore, "Invite paid customer" inserting a lead
-- already paid) records them without code changes:
--
--   paid_at  first time the lead reached paid / setup_in_progress / live
--   live_at  first time the lead reached live
--
-- Both are "first time" stamps: moving a lead back (live → paid, or to
-- cancelled) keeps them, so a median never forgets that a store did open.
--
-- Backfill: rows paid/live before this migration get APPROXIMATE stamps —
-- updated_at, pulled back to the onboarding's created_at for paid_at (a set-up
-- link is only issued after payment).

alter table public.checkout_leads
  add column if not exists paid_at timestamptz,
  add column if not exists live_at timestamptz;

comment on column public.checkout_leads.paid_at is
  'First time the lead reached paid/setup_in_progress/live (trigger-stamped). Rows paid before 2026-10-09 carry an approximate backfill.';
comment on column public.checkout_leads.live_at is
  'First time the lead reached live (trigger-stamped). Rows live before 2026-10-09 carry an approximate backfill.';

create or replace function public.stamp_checkout_lead_stage_times()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.status in ('paid', 'setup_in_progress', 'live') and new.paid_at is null then
    new.paid_at := now();
  end if;

  if new.status = 'live' and new.live_at is null then
    new.live_at := now();
  end if;

  return new;
end;
$function$;

drop trigger if exists checkout_leads_stamp_stage_times on public.checkout_leads;
create trigger checkout_leads_stamp_stage_times
  before insert or update of status on public.checkout_leads
  for each row execute function public.stamp_checkout_lead_stage_times();

-- Approximate backfill for rows already past "initiated".
update public.checkout_leads cl
set paid_at = least(cl.updated_at, coalesce(so.created_at, cl.updated_at))
from public.checkout_leads cl2
left join public.store_onboardings so on so.checkout_lead_id = cl2.id
where cl.id = cl2.id
  and cl.paid_at is null
  and cl.status in ('paid', 'setup_in_progress', 'live');

update public.checkout_leads
set live_at = updated_at
where live_at is null
  and status = 'live';

-- The pipeline reads leads by creation window.
create index if not exists idx_checkout_leads_created_at
  on public.checkout_leads (created_at desc);
