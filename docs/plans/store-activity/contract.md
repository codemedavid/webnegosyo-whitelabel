# Store Activity & Approvals — shared contract (v1, 2026-10-12)

Plan: https://claude.ai/artifact/RtAT4bb24pseDDN43Vz8WU. Every builder works to THIS file; change it
only by editing it (and saying so in your report), never by drifting in code.

Decisions taken (user approved all defaults 2026-10-12):
- Limits: staff with `order_refund` refund directly up to ₱300, same Manila business day; holders of
  `approve_requests` act directly / approve up to ₱1,000; above → owner. Discount > 20% and stock
  write-off > ₱500 at cost need approval. Owner can change per store (approval_rules).
- Requests expire after 30 minutes.
- Lock-screen Approve up to the approver's limit (device unlock); push shows order no., amount, staff
  first name — never customer data.
- New permission keys `activity_view` ("See store activity") and `approve_requests` ("Approve
  requests") are OPT-IN: owner/superadmin implicit, NOT granted by `permissions IS NULL`, NOT in
  IMPLIED_BY. Four registries: src/lib/staff-permissions.ts (source), webnegosyo-app/lib/staff-permissions.ts,
  webnegosyo-desktop/src/renderer/src/lib/staff-permissions.ts, supabase/functions/manage-staff/staff-core.ts,
  plus webnegosyo-app/lib/team-roster.ts PERMISSION_LABELS; parity test tests/unit/staff-permissions-parity.test.ts.
- Phase 0 security first; app before web.

## SQL permission helper (Phase 0 owns it)

`public.app_user_has_permission(p_tenant_id uuid, p_key text) returns boolean` — SECURITY DEFINER,
`search_path = ''`, STABLE, caller = auth.uid(). Mirrors `hasPermission` in src/lib/staff-permissions.ts:
superadmin / owner → true; `permissions IS NULL` → true EXCEPT for keys in the opt-in set
(`activity_view`, `approve_requests`); IMPLIED_BY (`kitchen`,`tables` ← `orders`). Granted to
authenticated, revoked from anon/public. Companion: `public.app_user_reaches_outlet(p_tenant_id, p_outlet_id)`
may reuse existing `app_user_may_reach_branch`.

## store_activity (Phase 1 owns it)

Append-only, platform DB, every backend. No anon/authenticated grants at all (service role + definer
functions only). Trigger blocks UPDATE except the review columns via `mark_store_activity_reviewed`,
blocks DELETE for every role.

Columns: id uuid pk, tenant_id, outlet_id (nullable = store-wide), occurred_at timestamptz,
category text, kind text, is_routine boolean (routine rows are folded into roll-ups by readers),
actor_user_id uuid null, actor_name text null (snapshot; null actor = "System"/"Customer" by kind),
approved_by uuid null, approved_by_name text null,
amount numeric null (pesos, signed from the store's point of view: money out negative),
quantity numeric null (signed), unit text null, reason text null, note text null,
subject_type text null ('order','ingredient','menu_item','shift','member','voucher','staff','setting','approval','count','transfer'),
subject_ref text null (id as text — NO foreign keys; survives order deletion),
order_number text null (display, e.g. '#14' daily number or short id),
backend text null ('platform'|'convex'|'supabase'), external_order_id text null,
before jsonb null, after jsonb null, summary jsonb not null default '{}' (NO customer PII: masked name/phone only),
flags text[] not null default '{}', reviewed_by uuid null, reviewed_by_name text null, reviewed_at timestamptz null,
source_table text not null, source_id text not null, event_key text not null unique, created_at default now().
Indexes: (tenant_id, occurred_at desc, id desc); (tenant_id, outlet_id, occurred_at desc, id desc);
(tenant_id, actor_user_id, occurred_at desc); partial (tenant_id, occurred_at desc) where flags <> '{}' and reviewed_at is null.

### Categories → kinds (closed vocabulary; DB CHECK + TS union, test-enforced equal)

| category | kinds (routine in italics) |
|---|---|
| orders | order.cancelled, order.reopened, order.edited, order.deleted, *order.placed*, *order.status_changed*, *order.completed* |
| money | refund.issued, payment.recorded, payment.marked_paid, payment.proof_approved, payment.proof_rejected, discount.applied, voucher.redeemed, voucher.released, *payment.charged* |
| cash | shift.opened, shift.closed, cash.pay_in, cash.pay_out, cash.collected, receipt.reprinted |
| stock | stock.received, stock.wasted, stock.counted, stock.adjusted, stock.transfer_sent, stock.transfer_received, stock.duplicate_blocked, stock.alert, *stock.sale*, *stock.restored* |
| loyalty | loyalty.reward_claimed, loyalty.reward_voided, loyalty.stamps_adjusted, loyalty.program_changed, *loyalty.stamps_earned*, *loyalty.reward_issued* |
| menu | menu.price_changed, menu.availability_changed, menu.item_added, menu.item_removed |
| team | staff.added, staff.removed, staff.access_changed, settings.changed, rules.changed, assistant.action_confirmed, campaign.status_changed, voucher.status_changed |
| approvals | approval.requested, approval.approved, approval.declined, approval.expired, approval.withdrawn, approval.executed, approval.failed |

### Flags (closed vocabulary)

paid_then_cancelled, cash_refund_noncash_order, after_hours, drawer_variance, removed_after_kitchen,
repeat_cancels, count_variance, duplicate_deduction. Computed at write time (trigger/writer) by ONE SQL
function per rule where possible; thresholds: drawer ±₱100, count ±10%, repeat cancels ≥3 per actor per
Manila day. TS mirror holds the copy/explanations.

### Visibility (enforced in get_store_activity, NOT in the client)

- Caller resolved from auth.uid(); must be an app_users admin/superadmin of p_tenant_id.
- Own rows (actor_user_id = auth.uid()) always visible.
- Other rows need `activity_view` (or `approve_requests`, or owner); branch from the ACCOUNT's outlet_id
  (branch-locked → that outlet + store-wide NULL rows). A client p_outlet_id can only NARROW.
- category 'team' → owner/superadmin only.

### RPCs (all SECURITY DEFINER, search_path '', revoke anon/public, grant authenticated)

1. `get_store_activity(p_tenant_id uuid, p_limit int default 50 (max 100), p_before_occurred_at timestamptz default null,
   p_before_id uuid default null, p_since timestamptz default null, p_until timestamptz default null,
   p_categories text[] default null, p_outlet_id uuid default null, p_actor_user_id uuid default null,
   p_flagged_only boolean default false, p_include_routine boolean default false, p_search text default null,
   p_subject_type text default null, p_subject_ref text default null)`
   returns setof rows: id, outlet_id, outlet_name, occurred_at, category, kind, is_routine, actor_user_id, actor_name,
   approved_by_name, amount, quantity, unit, reason, note, subject_type, subject_ref, order_number,
   before, after, summary, flags, reviewed_at, reviewed_by_name. Keyset order (occurred_at desc, id desc).
   p_search matches order_number / summary->>'title' / reason (ILIKE, bounded).
2. `get_store_activity_summary(p_tenant_id, p_since, p_until, p_outlet_id default null)` returns jsonb:
   { byKind: [{kind, count, amount, quantity}], byActor: [{actorUserId, actorName, kind, count, amount}],
     byDay: [{day (Asia/Manila date), kind, count, amount}], flaggedOpen: int } — same visibility rules.
3. `mark_store_activity_reviewed(p_id uuid)` — needs activity_view/owner + reach; only sets reviewed_*; idempotent.

## App / web DTO (TS, camelCase) — `StoreActivityEvent`

{ id, outletId, outletName, occurredAt (ISO), category, kind, isRoutine, actorUserId, actorName,
approvedByName, amount, quantity, unit, reason, note, subjectType, subjectRef, orderNumber,
before, after, summary, flags, reviewedAt, reviewedByName }.
Pure TS modules (web `src/lib/activity/`, app `webnegosyo-app/lib/activity/`, kept in parity by a test):
taxonomy.ts (categories, kinds, routine set, flags), describe.ts (event → {title, subtitle, amountLabel,
tone, icon}) — sentences like "Ana refunded #14 · R-0042".

## Approvals (Phase 3 — contract reserved)

approval_requests(kind in refund|cancel_paid|discount|stock_writeoff, status pending|approved|executing|executed|failed|declined|expired|withdrawn),
order_refunds (R-0001 per tenant), approval_rules (one row per tenant). Routes: POST /api/approvals,
GET /api/approvals, POST /api/approvals/[id]/decision — bearer via withRequestBearer + requireBearerStoreCaller.
Note: another session is building `merchant_notifications` (bell inbox + /api/push/notify-merchant) — Phase 3
push should feed THAT inbox once it lands on main, not build a second bell.
