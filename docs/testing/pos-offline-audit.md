# POS offline audit — 2026-09-26

Scope: merchant app offline storage, snapshot fallback, checkout routing, background replay, desktop local ledger/replay/session restoration, and the Convex POS creation boundary. Source review and automated regression tests; no production writes, live tenant penetration test, or device power-loss test.

## Fixed findings

| Severity | Finding | Change |
| --- | --- | --- |
| High | Mobile checkout reported success after AsyncStorage rejected a save. Memory was published before persistence. | Persist before publishing and propagate failure to checkout. All queue mutations use one serialized update path. |
| High | Mobile read failures/corrupt records and desktop corrupt ledgers were treated as empty, allowing a subsequent checkout to overwrite paid sales. | Preserve the original bytes, reject writes until the ledger is readable, validate mobile replay records, and allow a later hydration retry. Only a genuinely absent desktop file starts empty. |
| High | A rejected paid-status update could still remove a mobile sale from the queue. | Require payment update success before writing the completion checkpoint, running bookkeeping, or removing the sale. |
| High | Desktop records had no tenant/deployment identity; all pending records were sent to whichever store was signed in. | New records carry tenant and Convex URL outside the mutation payload. Replay filters both and stops on a client/scope change. Unknown legacy records are retained and flagged for reconciliation. |
| High | Convex POS creation skipped the merchant access check, including duplicate-key lookups. | POS calls now use the existing merchant write gate before deduplication. Public web/mobile customer order behavior remains unchanged. |
| High | Desktop restored cached merchant access after an authoritative denial; mobile resource reads also returned cached data after a refusal. | Only unreachable/network errors permit fallback. Desktop retains original lookup error information for classification. |
| Medium | Convex mobile replay could hold the worker forever while disconnected. | Share a timer-cleaning deadline helper between checkout and replay; creation and payment requests have a 12-second deadline. |
| Medium | A sale arriving during a drain, or a refusal while continuously online, could remain pending without another trigger. | Retry every 20 seconds while foregrounded/online. Catch hydration and replay failures. Keep lifecycle stable across ordinary rerenders. |
| Medium | Mobile replay could use a newly selected backend for an old sale, or continue with stale account context. | Filter by stored backend, count mismatches as needing attention, and check the live account/store/deployment at replay boundaries. |
| Medium | A repeated local checkout key could enqueue duplicate bookkeeping work. | Deduplicate by tenant/client order ID and return the original receipt ID. |
| Medium | Desktop never supplied its session token to Convex merchant operations. | Attach the merchant token provider with a bounded session read. |
| Low | Unchanged catalog responses were rewritten because the snapshot timestamp changed. | Compare response content independently of the timestamp. |

## Maintenance and scaling

- Mobile queue writes now have one read/modify/persist/publish implementation; failed operations do not poison later operations.
- Network waiting has a shared deadline helper. It limits waiting, not execution: an already submitted mutation can still complete, so server idempotency remains essential.
- Replay remains serialized to preserve sale order and avoid concurrent bookkeeping for the same sale.
- Existing queue storage keys are retained. No destructive migration runs.
- These are still JSON ledgers. Each mutation is O(queue size), and the mutex is per process, not cross-tab. For long outages or high-volume registers, use a transactional per-sale SQLite/IndexedDB queue with indexed tenant/status lookups and durable per-step delivery records. This change does not claim that migration is complete.

## Remaining limits and follow-up work

1. **Bookkeeping is still best effort.** Stock, Loyverse, voucher, activity and customer-capture notifications use callers that can swallow delivery failures. A sale can leave the queue without all those endpoints accepting it. A process crash after a remote effect but before its local checkpoint can also duplicate a non-idempotent effect. Safe automatic recovery requires server-side idempotency/delivery acknowledgement for each effect, then durable per-effect retries; blindly retrying the current calls can double receipts. Comments claiming exactly-once/at-most-once crash safety were corrected.
2. **Platform creation is not one transaction across the order and its items.** The adapter detects explicit partial writes, but ambiguous timeouts and deduplication still warrant an atomic server create operation. No database migration was added in this audit.
3. **Offline authorization is a cached snapshot.** It cannot discover revocation while disconnected. Customer data and session/cache metadata retain their existing local-storage protection. No encryption or offline authorization-expiry policy was introduced.
4. **Mobile captures the backend type, not the original Convex deployment URL.** Type changes are blocked; moving between two Convex deployments under the same tenant still needs an explicit migration/reconciliation policy for queued sales.
5. **Convex creation assigns its order date/number at replay time.** Mobile keeps the original tender timestamp for bookkeeping; the platform path passes the timestamp to order creation. Historic Convex sale dating requires a versioned server/client contract.
6. Reconciliation UI/export for damaged, legacy, exhausted or migrated queues remains limited. Preserve device data; do not clear app storage to resolve these cases.

## Rollout

- Rebuilt `src/lib/convex-push-bundle.json` from the current template, including pre-existing workspace changes. The POS gate has not been deployed to tenant backends.
- The gate respects existing `auth_enforced` rollout settings. Soft-mode deployments still admit unidentified clients by design; this audit does not enable enforcement across production.
- Release the desktop token-provider change alongside the gate. Existing desktop sales without tenant/deployment identity are deliberately **not auto-assigned** to the next signed-in store. Reconcile them against known receipts/store history before assigning ownership.
- Existing mobile queues keep their storage format. Malformed records now block overwrite instead of silently disappearing.

## Verification

- Merchant app: 16 relevant suites, **128 tests passed**, including queue persistence failures, concurrent writes, damaged storage, payment refusal, stalled mutations, account/backend isolation, periodic retry and rerender lifecycle.
- Desktop/server: 5 suites, **10 tests passed**, including real temporary-file ledger persistence, cross-store replay, session denial, bounded token reads, and Convex POS authorization before deduplication.
- Merchant app TypeScript check passed.
- Desktop main/preload and renderer TypeScript checks passed.
- Targeted ESLint passed for changed mobile/desktop modules and new/updated tests.
- Convex prebundle succeeded.
- Repository-wide `npm run lint` reported **26 errors and 341 warnings**, including existing CommonJS plugin imports and other unrelated files. The targeted checks above are clean.
- Automated checks do not cover real Bluetooth printers, device force-kills, production permission configuration, or live tenant deployment.
