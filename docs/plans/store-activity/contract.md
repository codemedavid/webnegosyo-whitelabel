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

`public.app_user_has_permission(p_tenant_id uuid, p_permission text) returns boolean` — SECURITY DEFINER,
`search_path = ''`, STABLE, caller = auth.uid(). Mirrors `hasPermission` in src/lib/staff-permissions.ts:
superadmin / owner → true; `permissions IS NULL` → true EXCEPT for keys in the opt-in set
(`activity_view`, `approve_requests`); IMPLIED_BY (`kitchen`,`tables` ← `orders`). Granted to
authenticated + service_role, revoked from anon/public. Shipped in 20261012140000_security_floor_activity.sql.
(Edited by Phase 0: the parameter is `p_permission`, not `p_key` — the function already existed live,
created by the gov-discounts branch, and its gov_discount_* policies block the DROP a rename needs.
Call it positionally.) TS: `OPT_IN_PERMISSION_KEYS` + `isGrantedByFullAccess()` in every registry copy.
No `app_user_reaches_outlet` was created: use the existing `app_user_may_reach_branch(tenant, outlet)`.

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
- Flags are PRIVATE (design-spec P8 / §5): a caller WITHOUT activity_view/approve_requests/owner gets
  `flags = '{}'`, `reviewed_*` null on their own rows, and p_flagged_only returns nothing for them.
- Statutory discounts (Senior Citizen / PWD, RA 9994 / RA 10754) are recorded as discount.applied with
  summary.statutory = true; readers never count them as "money that didn't stay" and approvals never
  gate them. Summary RPC returns them separately (byKind entry kind 'discount.applied' split via
  `statutory` boolean field).

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
   { byKind: [{kind, statutory, count, amount, quantity}], byActor: [{actorUserId, actorName, kind, count, amount}],
     byDay: [{day (Asia/Manila date), kind, count, amount}], routine: [{kind, count, amount}], flaggedOpen: int } —
   same visibility rules. byKind/byActor/byDay cover NON-routine kinds; routine kinds appear only as `routine` roll-ups.
3. `mark_store_activity_reviewed(p_id uuid)` — needs activity_view/owner + reach; only sets reviewed_*; idempotent; a non-owner can never review a row they are the actor of. Returns `timestamptz` (the reviewed_at; a repeat call returns the first review's time).

### Phase 1 implementation notes (2026-10-12, Phase 1 builder)

- Migrations: 20261012150000 (table, vocab functions, writer `store_activity_record`, flag rules,
  `orders.cancel_reason`, `order_status_events.reason/note`), 151000 (order & money triggers),
  151100 (stock / cash / loyalty), 151200 (menu / team / settings gaps), 151500 (RPCs), 152000 (backfill).
  150500 validates the NOT VALID length CHECKs separately. Probe: supabase/probes/20261012150000_store_activity_probe.sql.
- Order-status dedupe is by PARTITION, not by key: platform stores are captured from `orders`
  (AFTER UPDATE OF status/payment_status/discount_*, actor = auth.uid()); `order_status_events` rows with
  backend `platform_supabase` are ignored live; Convex / tenant-Supabase rows come only from that table.
- Actor: `store_activity_actor()` = auth.uid() if it is a store account (app_users admin/superadmin), else
  the transaction GUC `app.actor_user_id` a service-role writer may set
  (`select set_config('app.actor_user_id', '<uuid>', true)` — manage-staff should adopt it), else NULL.
  A signed-in customer is never an actor.
- Statutory discounts: summary.statutory = true from `gov_discount_claims` (trigger created only when that
  table exists) or from order discount lines labelled Senior/PWD/SC/athlete/medal of valor; voucher lines
  are excluded from discount.applied (voucher.redeemed reports them).
- Free text (reason, note, summary.title) is scrubbed in the writer: PH mobile numbers and emails → '•••'.
- History is replayed by `store_activity_backfill_batch(p_source, p_after_ts, p_after_id, p_limit)` (service role,
  resumable, keyset; run loop in 20261012152000's header) — the migration itself writes no rows.
- Stock used by an order is ONE routine `stock.sale` / `stock.restored` row per order application (from
  inventory_audit_log, top lines in summary.lines), not one row per ingredient line.
- Client-written actor columns (staff_shifts.closed_by, inventory_counts.started_by/closed_by,
  stock_transfers.created_by/sent_by/received_by) are stamped from the JWT; triggers prefer the JWT actor.
- `flags` thresholds as above; `after_hours` only for stores with `enforce_operating_hours` (branch hours
  win; never on backfilled rows); `duplicate_deduction` only for a BLOCKED duplicate (spec copy says "was blocked").
- Loyalty rows' subject_ref is the member's loyalty_balances.id (never phone-derived).

## App / web DTO (TS, camelCase) — `StoreActivityEvent`

{ id, outletId, outletName, occurredAt (ISO), category, kind, isRoutine, actorUserId, actorName,
approvedByName, amount, quantity, unit, reason, note, subjectType, subjectRef, orderNumber,
before, after, summary, flags, reviewedAt, reviewedByName }.
Pure TS modules (web `src/lib/activity/`, app `webnegosyo-app/lib/activity/`, kept in parity by a test):
taxonomy.ts (categories, kinds, routine set, flags), describe.ts (event → {title, subtitle, amountLabel,
tone, icon}) — sentences like "Ana refunded #14 · R-0042".

## Design spec

docs/plans/store-activity/design-spec.md (2026-10-12) governs UI/copy. Where it and this contract
disagree, this contract wins; spec items marked [contract?] were folded in above where accepted.
Accepted from the spec: textMuted #6E685E token for meta text, formatSignedPeso ("−₱185", U+2212),
primary buttons ink or #B23E1B (never white-on-coral), push Approve uses opensAppToForeground:true on
both platforms (+ isAuthenticationRequired on iOS) with a 4-second Undo before sending, server only
targets the `approvals` Android channel on devices that registered it.

## Approvals (Phase 3 — contract reserved)

approval_requests(kind in refund|cancel_paid|discount|stock_writeoff, status pending|approved|executing|executed|failed|declined|expired|withdrawn),
order_refunds (R-0001 per tenant), approval_rules (one row per tenant). Routes: POST /api/approvals,
GET /api/approvals, POST /api/approvals/[id]/decision — bearer via withRequestBearer + requireBearerStoreCaller.
Note: another session is building `merchant_notifications` (bell inbox + /api/push/notify-merchant) — Phase 3
push should feed THAT inbox once it lands on main, not build a second bell.

### Phase 3 implementation notes (2026-10-12, Phase 3 server builder)

- Migration 20261012160000_approvals.sql; probe supabase/probes/20261012160000_approvals_probe.sql.
  Tables approval_rules / approval_requests / order_refunds (+ order_refund_counters) have NO
  INSERT/UPDATE grant for anon, authenticated or service_role: every write is a SECURITY DEFINER
  function executable by service_role only, behind the /api/approvals/** routes. SELECT: requester +
  approvers in reach (approval_requests, also in supabase_realtime); order viewers (order_refunds);
  store accounts (approval_rules). A guard trigger enforces the state machine and identity columns.
- Orders referenced by TEXT id, no FK (survive order deletion). Platform backend only for order kinds;
  others get 409 "Refunds for this store type are coming soon." (code backend_unsupported).
- Direct (within the caller's own limit) = request inserted `approved` + `is_direct` and executed in the
  same transaction; approve = transition + execution in the same transaction. Business refusals come back
  as {ok:false, code, message}; a failed execution leaves status `failed` with `error`.
- Money: refunds split across the order's tenders newest-charge-first, one order_payments kind='refund'
  row per tender, recorded_by = the REQUESTER. A cash part needs the requester's open shift at the
  order's branch (else no_open_shift). An order paid by status with no ledger rows gets an opening charge
  (at the sale's time, by the POS cashier) first. Items/amount scope reduce orders.total via an
  order_revisions row; whole/cancel_paid cancel the order and release voucher redemptions.
- Activity: ONE refund.issued per order_refunds row (actor = requester, approved_by = approver, key
  order_refunds:<id>); approval.* rows keyed approval_requests:<id>:<kind> (direct actions write none);
  rules.changed with before/after. store_activity_on_order_payments / _on_order_revisions (Phase 1
  wrappers) now skip payment/revision rows that belong to an order_refunds row; a whole refund pre-writes
  its order.cancelled row under the orders trigger's own event key (approver named, no
  paid_then_cancelled flag). Writer approvals_activity() exists because store_activity_record has no
  approved_by parameter.
- platform_device_tokens.channels text[] (default '{}'): the app must write ['approvals'] once it creates
  that Android channel; until then pushes use the default channel.
- Server-side facts only: the discount percent is computed by approval_quote (amountOff ÷ order total);
  a requester must reach the order's branch (approval_user_reaches); an approver's cap applies to
  decline too (design-spec §3.7: over-limit requests are read-only, the owner answers them).

### Approvals hardening (20261012170000, 2026-10-13)

- Every `order_payments` refund row (any role) passes `order_payments_refund_guard`: order locked, refunds
  never exceed what was charged (implicit ledger = paid-by-status total). Client roles also need the direct
  limit (`approval_refund_within_own_limit`), else 42501 with EXACTLY
  `This refund needs approval. Ask a manager to approve it.` (`REFUND_NEEDS_APPROVAL_MESSAGE`, web + app).
- Direct limits are cumulative: the order's refunds so far + this ≤ the cap (₱300 staff, manager cap for
  approvers); an order_refund holder's direct refunds today + this ≤ the manager cap.
- Discount requests are refused (`not_supported`) until the register redeems tokens; tokens are stored as
  sha256. A cost-unknown write-off is never direct. Replayed idempotency key with different details →
  409 `idempotency_conflict`. Unknown implicit tender = cash. Item refunds are scaled by
  orders.total ÷ Σ line net (round per line to the centavo).
- Over-limit approvers may decline (`canDecline` on the request view); approving a cash refund needs the
  requester's open drawer. Superadmins may read, not write. Lost follow-ups are re-run by
  `claim_approval_side_effects` (swept from GET /api/approvals).
