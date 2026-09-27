# Loyalty program implementation plan

> Execute in the existing working tree, preserving the user's uncommitted work. Use subagent-driven-development for isolated UI work and review; keep mutations to overlapping files sequential.

**Goal:** Dependable automatic stamps, clear next-card progress, and auditable owner workflows on web and mobile.

**Architecture:** Retain the platform loyalty ledger and atomic entitlement engine. Add consistent availability/read contracts, background recovery, and append-only activity. Customer and owner UIs consume those facts without synthesizing earned balances.

**Tech stack:** Next.js, React, Supabase PostgreSQL, Convex adapters, Expo React Native, Jest.

## Delivery tasks

- [x] Customer progress: regression for a ready reward plus zero/one new stamps; remove artificial full rows in `src/components/customer/loyalty-progress-panel.tsx` and `loyalty-stamp-card.tsx`. Refresh hooks safely on focus and changes; distinguish unavailable reads. Improve wallet hierarchy and terminology. Run customer loyalty component/hook suites.
- [x] Accounting reads: count `issued` and `restored` consistently; preserve paused/ended card visibility without enabling earning. Add store/progress regressions. Keep the existing single-card receipt selection; full multi-program receipt presentation remains in the broader roadmap.
- [x] Automatic recovery: add durable reconciliation work and bounded cron processing for captured orders; source-check missed completion events and replay ordinary idempotent earning. Use conservative order-time activation/version boundaries when historical completion is unknown; preserve tenant identity and reversal behavior. Recovery for programs currently paused or ended remains excluded. Test replay, failure, and missing identity.
- [x] Audit: record entitlement/ledger transitions atomically through SQL triggers; add tenant-authorized, paginated activity endpoint with member/event filters and safe error handling. Verify migration and read authorization.
- [x] Owner web/app: Activity section, clear member progress/reward distinction, actor/order/reason log details, focus refresh, and safe correction forms. Use existing design tokens and navigation. Run web and native suites.
- [x] Integration review: inspect spec coverage and code quality independently, run focused web/native/SQL suites and type checks, record deployed prerequisites and any remaining rollout requirements honestly.

## Behavioral acceptance fixtures

```text
9 stamps + completed order => 0 next-card stamps, 1 reward available
0 stamps + ready reward + completed order => 1 stamp, same reward available
consume previous reward => 1 stamp, reward used (no second balance deduction)
restore reward after refund => availability agrees on owner and customer reads
failed lifecycle notification => background recovery credits once
repeated recovery => unchanged balance and no second reward
paused program => retained card visible, no new earning under paused rules
switch member/tenant while fetch pending => old response cannot replace new identity
reward transition => immutable activity with actor if recorded, no tokens or OTPs
```

## Validation commands

```sh
npx jest --config jest.config.cjs --runInBand tests/unit/loyalty tests/unit/components/customer/loyalty-progress-panel.test.tsx tests/unit/components/customer/loyalty-stamp-card.test.tsx tests/unit/components/customer/loyalty-wallet.test.tsx tests/unit/use-order-stamps.test.tsx tests/unit/use-loyalty-progress.test.tsx
cd webnegosyo-app && npx jest --runInBand lib/loyalty
```

Add new focused suites to these commands as their files are created. Do not run live migrations or data repair through unit tests. Database deployment and existing-customer reconciliation need explicit reporting as rollout work, not a claim that local source edits fixed production.


## Implemented and verified locally

- Customer receipt, checkout and wallet distinguish available rewards from the real next-card balance. A used reward does not reset new stamps. Restored rewards count consistently; held paused/ended cards stay visible.
- Customer reads refresh on focus/reconnect with identity guards and visible failures. An open claim QR has bounded polling; a consumed reward is removed on refresh. The wallet uses tenant branding and shared stamp visuals.
- Web administration and the merchant app show member progress, separate reward availability, and paginated activity with earning, correction and reward transitions. Activity records include order, branch, recorded actor and reason. Missing historical actors are labelled honestly. Existing authorization remains `loyalty_manage`.
- A durable queue recovers missed earning for centrally captured platform, tenant-Supabase and Convex orders. Jobs use leases, revisions, retries and the normal idempotent earning engine. Source rechecks are required for external orders.
- Activity is recorded atomically with ledger/reward writes. Historical rewards are backfilled as snapshots; unknown past transitions are not invented.

Validation on 2026-09-26:

- Web: 58 focused suites, 598 tests passed.
- Merchant app: 17 focused suites, 130 tests passed, including overlapping foreground and pull-to-refresh requests.
- Seven PGlite SQL runners passed: activity, earning recovery, wallet, earning, settlement, claims, and management. The activity runner also verifies ten stamps unlock a reward, a later order advances to one stamp, consumption preserves it, and a retried subsequent order advances only once to two.
- Targeted loyalty lint and diff whitespace checks pass. Native TypeScript passes. Root TypeScript remains blocked by desktop `Window.api`, `ImportMeta.env`, and related typing errors outside this change; no loyalty diagnostics were reported.
- Mobile wallet inspected at a 390px viewport using an isolated browser fixture: available reward plus 1/10 next-card stamps, no horizontal overflow. Local public wallet lookup returned 503 because private loyalty configuration is unavailable; live SMS, redemption and native device UX were not end-to-end verified.
- SQL tests use PGlite, not multi-session production PostgreSQL contention tests.

## Rollout requirements

No production migration, configuration change, reconciliation or deployment was performed.

1. Apply the existing prerequisite loyalty migrations, then these new migrations in order:
   - `supabase/migrations/20260926150000_loyalty_activity.sql`
   - `supabase/migrations/20260926151000_loyalty_earning_recovery.sql`
   - `supabase/migrations/20260926152000_loyalty_wallet_history.sql`
2. Deploy the server and updated web/app clients. Configure `CRON_SECRET` and verify the new once-per-minute `/api/loyalty/earning-recovery` schedule alongside existing maintenance. Existing claim keys, SMS delivery, ingress and settlement flags are described in `docs/loyalty-claims-integration.md`; do not enable unsupported integrations just to suppress a configuration error.
3. Recovery seeds only the last 30 days of captured orders for tenants already using live loyalty. It does not discover external orders never captured centrally. Five jobs run per invocation, so backlog and backend availability determine latency; a one-minute schedule is not a one-minute credit guarantee.
4. Inspect queue age, `last_result`, failed jobs and source/accounting discrepancies during a tenant pilot. Old orders and ambiguous identity/history require a reviewed reconciliation batch through the ordinary engine. Source projections are not proof of historical program activation.
5. Verify the complete repeat-order journey against deployed platform Supabase, tenant Supabase and Convex, including two concurrent earning/redemption requests, cancellation/refund and lost responses.

## Broader roadmap still outstanding

The original discovery document is intentionally broader than this implementation. This delivery does not yet include:

- Historical program status timelines: a currently paused/ended program is not automatically recovered for an older order. Conservative order-time eligibility can exclude orders placed before activation but completed after it.
- An owner recovery-exception queue with retry controls, full-dataset overview analytics, all proposed log filters/exports, or every proposed security/program-change event.
- A verified customer activity history, missing-stamp case workflow, phone transfer/account recovery, or a changed late-receipt attachment policy.
- New granular staff/branch permissions, full multi-program receipt presentation, or an overhaul of capped member-directory aggregates.
- New online/POS cart redemption adapters, broader modifier/bundle support, lost verification-response recovery, or a changed partial-refund policy.

Existing business rules and supported redemption boundaries remain in effect. These gaps must be resolved before describing the entire discovery roadmap as complete.
