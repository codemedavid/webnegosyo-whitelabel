# Complete loyalty program: discovery and proposed delivery plan

Date: 2026-09-26
Status: Broad product roadmap. Automatic linked-number earning and the consistency/activity implementation were authorized on 2026-09-26. See [implementation and rollout status](../plans/2026-09-26-loyalty-program.md) for delivered work, test evidence and remaining scope.

## Outcome

Customers should understand what they earned, what is still pending, how close they are to their next reward, and which rewards they can use. Owners and staff should be able to explain the same numbers, find missing credit, inspect every claim, and resolve problems from both web administration and the WebNegosyo owner app.

The central acceptance journey is: link number → complete order → earn stamp → complete a card → receive reward → use reward → order again → see the next card advance. Every step must survive refreshes, device changes, retries, cancellations, and delayed synchronization.

Scope assumes the existing customer storefront/receipt/wallet and the existing WebNegosyo merchant app. A separate customer native app is not assumed. Automatic linked-number earning was accepted. The implementation follows existing tenant branding and merchant app design tokens; other business-policy proposals below remain decisions for later delivery.

## What the repository shows

These are static code findings, not a reproduction of the current customer incident or verification of deployed migrations. There are extensive unrelated local changes, including edits to the loyalty progress hook; implementation must preserve them.

| Area | Existing behavior | Consequence for this work |
| --- | --- | --- |
| Accounting | Programs, immutable versions, balances, ledger entries, reward entitlements, reservations, settlement, reversal, and correction logic already exist. | Strengthen the existing accounting model rather than create a second balance system. |
| Threshold crossing | `src/lib/loyalty/earn.ts` spends the threshold to issue rewards and preserves the remainder. | A reward and a new card coexist; redemption must not reset the new card. |
| Customer display | `loyalty-progress-panel.tsx` and `loyalty-stamp-card.tsx` replace zero balance with a full stamp row when a reward is available. | A completed card and current progress are visually conflated. Remove this ambiguity. |
| Restored rewards | `balance-reads.ts` counts only `issued`; member reads count `issued` and `restored`. Refund restoration actually writes `restored`. | Owner and customer availability can disagree after refunds. Establish one availability policy. |
| Multiple programs | `planEarning` credits every eligible program; `selectLiveProgram` chooses one, preferring business scope, and receipt reads select one earn row. | Customer surfaces may show a different card or conceal other earned progress. |
| Historical cards | Receipt card summaries depend on active programs and return null when their program is absent. | Pausing or ending a program can make previously earned progress disappear from that surface. |
| Order lifecycle | General lifecycle earning is best effort. The existing incident document records a delivered Convex order whose central projection remained ready. Receipt reads include a targeted recovery path. | Reliable earning cannot depend on the customer reopening a receipt or another order event arriving. |
| Refresh behavior | Receipt progress polls every 10 seconds; checkout lookup runs when identity inputs change; wallet refresh is manual. | There is no consistent freshness contract across surfaces. |
| Failure behavior | Checkout progress errors collapse into an empty state. | Customers cannot distinguish unavailable progress from no loyalty account. |
| Member management | Web and app already provide member lists, individual progress, rewards, orders, history, and corrections. | Improve and complete these screens rather than rebuild basic member management. |
| History | Member history exposes ledger kind, delta, note, shortened order reference, and timestamp; details are limited to 50 records. | This is not a complete claims investigation log with actors, transitions, and pagination. |
| Scale | Member listing scans capped datasets; individual detail first searches that listing. | Large stores can have truncated totals or a member who cannot be found through this route. |
| Receipt attachment | `claim-window.ts` closes self-service number attachment once an order is fulfilled. | A customer who scans after eating needs an explicit policy and recovery journey. |
| Redemption scope | The integration document limits canonical reward sales to simple merchandise carts and documents unfinished lost-verification-response recovery. | Completeness requires explicit checkout compatibility and recovery work, not just new screens. |

Important evidence: `docs/testing/loyalty-receipt-progress.tdd.md`, `docs/loyalty-claims-integration.md`, `src/lib/loyalty/*`, customer loyalty components, admin loyalty components, and `webnegosyo-app/components/loyalty/*`.

## Approach choices

1. **Recommended: finish the existing loyalty system in coordinated stages.** Preserve balances and reward identities, unify state and lifecycle processing, then rebuild customer and owner journeys around those facts. This addresses both trust and presentation while retaining existing settlement protections.
2. **UI-only cleanup.** Fastest visible improvement, but missing lifecycle events and inconsistent availability remain. Insufficient for the requested result.
3. **Replace the loyalty engine.** Enables a new model but introduces unnecessary migration and accounting risk while duplicating substantial existing work. Only justified if the first accounting audit finds fundamental defects that cannot be repaired incrementally.

## Product contract proposed for confirmation

### Three facts, always separate

1. **This order:** pending, credited, ineligible, reversed, or under investigation; include the amount and reason.
2. **Next reward progress:** the actual current balance, threshold, and remaining stamps/points for a named program.
3. **Reward inventory:** individual rewards, each with its own terms, expiry, and available/reserved/used/expired/cancelled state.

Example for a 10-stamp program:

| Event | Next card | Rewards | Order message |
| --- | --- | --- | --- |
| Customer has nine stamps | 9 / 10 | None | Previous credit remains visible |
| Tenth qualifying order completes | 0 / 10 | One available | “+1 stamp. You unlocked ₱200 off.” |
| Another qualifying order completes | 1 / 10 | One available | “+1 stamp. Nine more to your next reward.” |
| Customer uses the earlier reward | 1 / 10 | One used | “₱200 reward used on order …” |
| Redemption order independently qualifies | 2 / 10 | One used | “+1 stamp from this order.” |

The final row depends on the selected earning policy for discounted orders. Reward consumption itself never subtracts the threshold again. The reward was funded when it was issued.

Use precise language: **Link this order**, **Stamp added**, **Reward unlocked**, **Use reward**, and **Reward used**. “Claimed” alone must not describe all five actions. Issuing an SMS code or QR does not mean a reward has been used.

### Recommended business defaults

- Automatic earning for qualifying orders that carry the linked, normalized phone number. Anonymous orders offer receipt attachment; a previous visit alone cannot identify a new anonymous order.
- One stamp per qualifying order, retaining existing points programs. Do not silently switch existing programs to a different earning mode.
- Preserve current qualification timing initially: POS settlement; online delivery/collection/completion. Separately confirm whether online orders must also have confirmed payment.
- Keep collecting while an earlier reward is available. Preserve surplus and support multiple rewards.
- Preserve earned cards and issued reward terms when a program pauses or ends; clearly label whether new earning is allowed.
- Keep existing expiry settings until an explicit rules revision. Do not add retroactive expiry to old balances or rewards.
- Use net eligible merchandise spend for new explicitly configured rules; exclude delivery and service fees. Freeze and explain treatment of discounts, refunded items, and free reward items.
- Keep tenant identities separate; business-wide programs span eligible branches, branch programs remain branch-specific. Show which scope applies.
- Keep existing multiple-program earning unless the owner explicitly changes future policy. Show every affected program rather than hide additional credit.
- Require a reason and authorized actor for corrections. Never edit or delete historical ledger entries to make a balance look right.
- Keep reward redemption online and confirmed by the server. Offline orders may show pending credit and reconcile later; do not promise offline redemption without a separately specified protocol.

These are proposals, not silently approved changes to live rules.

## Customer experience brief

Audience: customers ordering online or at a counter, often on a small phone, trying to confirm their purchase counted or use a benefit quickly. Primary action: understand current progress and the next available action without interpreting accounting states.

Proposed tone, awaiting confirmation: warm and branded for customers; clear and efficient for staff. Use the tenant's branding and existing product typography/tokens. Establish one spacing, type, status, and action hierarchy across receipt, checkout, and wallet. Do not select a new global font or theme during this planning pass.

### Entry points and hierarchy

- **Storefront:** discover the program and open “My rewards”; public rules require no phone entry.
- **Checkout:** show saved progress for the linked identity, then this order's expected earning and qualifying conditions. A preview is not posted credit. Changing number clears the old identity immediately.
- **Receipt/tracking:** show this order's earning result first, next-card progress second, available rewards separately, and a link to activity. Pending credit retains previous confirmed progress.
- **Wallet:** available rewards with “Use reward”; next-card progress for each program; recent activity; full history and program rules. Historical used rewards do not occupy the current-card area.
- **Number verification:** explain why verification is needed; support paste/autofill, resend countdown, number correction, and recovery after timeout. A verified session can support repeat visits without repeated OTP prompts according to the chosen session policy.
- **Redemption:** choose reward → verify if needed → review benefit and applicable order → reserve → confirm sale → show used reward and remaining progress. At a counter, show a readable QR and fallback reference with expiry. Online checkout uses the same entitlement/settlement contract through its supported adapter.
- **Missing stamp:** select an order → see pending/ineligible/credited explanation → request review when evidence is insufficient. Do not offer an unrestricted “add my stamp” button.

### Required states

First visit; no active program; anonymous order; known member; number changing; verification required; loading; current progress; pending earning; qualifying order credited; threshold crossed; multiple rewards; reward reserved elsewhere; expired QR; reward used; restored reward; paused/ended program; below minimum spend; wrong branch; cancellation; refund; stale cached progress; offline; temporary failure; permission/session expiry.

An unavailable read must say “We couldn't refresh your stamps” and retain a clearly marked last confirmed result for the same identity. It must never turn an unknown balance into zero. A customer-safe explanation must distinguish pending credit from ineligible credit.

### Feedback and accessibility

- Animate only a newly confirmed earning or reward event, keyed by event identity. Reloading the page must not replay “you just earned” celebrations.
- A brief threshold celebration may show the completed card, then explicitly introduce the next card while the unlocked reward stays visible.
- Support reduced motion, large text, keyboard focus, screen reader announcements, and status meaning without color alone. Target WCAG AA in implementation review.
- Keep primary actions reachable on small phones; support long merchant/reward names and thresholds too large for individual stamp icons.
- Detailed personal history requires verified identity. A raw phone-number lookup must not gain access to orders, addresses, internal notes, or full activity.

Visual review artifacts after direction is confirmed: first-time checkout, pending receipt, threshold crossing, reward-ready wallet with another card in progress, used reward, mobile member detail, and claim investigation. Review compact mobile and desktop layouts before coding final components.

## Owner experience: web and app parity

The app is a primary operational surface. Every core investigation and correction must be possible without sending the owner to the website.

| Owner question | Required answer and action |
| --- | --- |
| “How is the program doing?” | Member participation, active members, issued/used/expired rewards, actual discounts applied, and unresolved credit issues, with date and branch filters. Define each metric and link to underlying records. |
| “Who is close to a reward?” | Searchable member list with actual next-card progress, available reward count, last qualifying order, and filters for near reward/reward ready/inactive/issues. |
| “Did this customer's last order count?” | Member detail and order detail show the same order earning decision, timestamp, rule version, and linked activity. |
| “They say a stamp is missing.” | Inspect source order, identity, qualification, lifecycle delivery, and ledger result; retry safe reconciliation or make a separately logged correction. |
| “Who claimed this reward?” | Claim/redemption detail links customer, reward, order, branch, staff/register, timestamps, actual benefit, and outcome. |
| “Why did their balance change?” | Chronological earning, threshold conversion, correction, reversal, and restoration events with before/after values when known. |
| “Can staff change balances?” | Separate view, redeem, adjust, manage-program, and export permissions; branch scope enforced on the server. |
| “Can I change the offer?” | Versioned program editor with customer preview, effective date, and a clear explanation of effects on existing progress and issued rewards. |
| “Are all stores synchronized?” | Operational exception list with age, affected order, last attempt, and permitted retry; also available in the app. |

Proposed navigation: Overview, Members, Activity, Programs. Exception counts link into Activity. Mobile uses concise lists, full member/detail screens, and filter sheets; web uses searchable tables and linked detail views. Avoid long forms or all management actions competing above customer progress.

Member detail order: identity → next-card progress and available rewards → recent order result → activity → orders → permissioned actions. Corrections use an explicit form with reason and a review of the resulting change, replacing browser prompts.

Analytics must distinguish issued face value from actual redeemed discount and unknown free-item cost. Observed repeat purchase rates do not establish incremental revenue caused by loyalty. Aggregate totals must cover the full selected dataset, not a loaded page or 5,000-row sample.

## Claims and activity logs

Create a unified activity read model from existing durable records plus new append-only events for transitions that are not currently recorded. The log is an explanation layer; it is not a second authority for balances.

Record, where applicable:

- Event ID, event type, tenant, program and frozen version, customer identity reference.
- Order/backend reference, reward ID, reservation/settlement reference, and correlation/request ID.
- Branch, channel, actor type and ID, and register/device reference where known.
- Previous and new state; stamp/point delta; confirmed balance before/after; reward benefit actually applied.
- Event occurrence time and recording time; reason, outcome, and related reversal/recovery event.

Include order attachment, earning pending/credited/ineligible, reward issued, verification attempt outcome, reservation created/released/expired, reward used, manual honouring, correction, reversal, refund restoration, program revision, and reconciliation results. Verification attempts belong to restricted operational activity; normal owners should see concise claim outcomes, not security internals.

Never record OTP values, claim tokens, device credentials, or full verification payloads. Customer history omits staff-only notes and personal identifiers of staff. Authorize and redact exports consistently with on-screen permissions. Set retention by data class before rollout; do not assume indefinite retention of authentication attempts.

Filters: date range, branch, member, order/reference, event type, result, actor, program, and channel. Cursor pagination and server-side search are required on both web and app. Downloads use the same filters. Existing records with missing actors or before/after balances must display “Not recorded”; backfill must not invent historical evidence.

## Reliability and architecture

1. **Accounting core:** preserve atomic earning, threshold conversion, entitlement reservation/consumption, and reversals. Use business-operation idempotency keys and transactional writes for authoritative state plus its audit event.
2. **Order integration:** durably record lifecycle delivery in the source backend transaction where supported, then retry processing. Cross-database writes require an outbox/inbox or checkpointed reconciliation contract; a frontend fetch after status change is insufficient. Cover platform Supabase, tenant Supabase, and Convex.
3. **Historical rules:** resolve program eligibility and rules using the authoritative earning instant and preserved program history. General order processing currently loads active/current rules; delayed events must not earn under a newly edited offer or lose credit because it was paused later. Missing historical timestamps become reviewable uncertainty.
4. **Canonical summaries:** define shared semantic contracts for member/program progress, order earning decisions, reward availability, and activity. Web and native renderers may differ; balances, status labels, and business calculations must not drift.
5. **Refresh:** return a consistent snapshot and revision from mutations/reads; invalidate member, wallet, order, totals, and activity together. Refresh on screen focus/reconnect and use bounded polling or subscriptions for pending operations. Discard late responses for an old tenant, member, order, or revision.
6. **Recovery:** durable attempts, backoff, visible failed work, safe retries, and checkpointed sweep for missed completions. Track time from qualifying order to posted credit. Receipt recovery is a fallback, not the primary delivery mechanism.
7. **Identity:** normalize phone consistently and scope to tenant. Specify verified account recovery and audited number transfer/merge, including conflict resolution for active reservations; never merge solely because a name matches.
8. **Permissions:** derive tenant and branch authority server-side. Separate operational member viewing from balance/reward mutations. Raw phone lookup remains a minimal public surface; personal history uses verified access.

### Compatibility work required for complete redemption

The existing supported-cart boundary must become an explicit capability matrix for POS and online ordering: base items, paid modifiers, bundles, tracked inventory, presell, delivery, fees, order-type pricing, vouchers/manual discounts, and payment methods. For each adapter, implement server pricing, reservation, stock, settlement, cancellation, and refund behavior together. Unsupported combinations must be clearly identified before payment; they must not fall back to a second sale creator.

Preserve the existing uncertain-settlement journal and receipt recovery. A timeout cannot cause double charging, double stock deduction, or double redemption. Add safe recovery for successful verification whose response was lost. Unavailable free items need an owner-approved policy: default to retaining the reward and explaining availability; do not silently substitute another item.

## Edge cases and proposed handling

| Scenario | Expected behavior |
| --- | --- |
| Repeat order while reward is unused | New card advances; old reward stays available. |
| Two orders finish simultaneously | Both eligible orders credit once; threshold conversion issues the correct number of rewards. |
| Duplicate/reordered lifecycle events | No duplicate stamps; an older event cannot resurrect a cancelled/refunded order. |
| Order completes while device is offline | Existing balance remains visible; pending credit resolves after synchronization. |
| Customer closes the receipt immediately | Background processing still credits the qualifying order. |
| Owner and customer are viewing together | Both converge on the same revision; stale state is identified. |
| Number entered incorrectly | Verify before moving value; audited correction/transfer with conflict checks. |
| Customer scans receipt after completion | Current system refuses attachment; choose controlled late-claim or staff-review policy before changing this. |
| Partial refund | Recompute qualifying eligible spend; reverse only the required earning delta. Keep current no-automatic-reward-restoration behavior until the partial-refund policy is approved. |
| Full refund | Reverse earning and restore a redeemed entitlement only when eligible; preserve original expiry and record the separate restoration. |
| Refund after earned reward was already spent | Preserve ledger debt or another approved policy; explain it instead of masking the accounting result as ordinary zero progress. |
| Cancel/reopen order | Lifecycle revisions determine whether it qualifies again; every reversal and renewed earning must remain idempotent. |
| Two registers use the same reward | One reservation wins; the other sees an actionable already-reserved/used result. |
| Settlement succeeds but response is lost | Recover the original receipt using stable IDs; never collect payment again. |
| Reward expires during a reservation | Apply one explicit server policy at the reservation/settlement boundary; release expired holds without resurrecting expired rewards. |
| Program changes mid-card | Preserve already-promised progress according to the chosen version transition policy; show the transition before owner confirmation. |
| Program ends or is paused | Historical card remains visible; valid issued rewards remain distinguishable from new earning availability. |
| Reward restored after refund | Customer and owner availability agree and refresh together. |
| SMS unavailable | Show saved reward and a truthful recovery path; never claim that code delivery succeeded without confirmation. |
| Large store or long history | Server-side search, direct member lookup, accurate aggregates, and pagination; no silent truncation. |

## Delivery sequence and exit criteria

### 1. Reproduce and define the rules

Trace a reported affected order and its next order across source status, saved phone, customer projection, program version, ledger, entitlement, and UI response. Obtain the relevant store/order references if they cannot be found from an authorized incident context. Verify deployment/migration state before concluding code changes are live.

Exit: explain whether the incident is missing credit, a different identity/program, threshold conversion, stale display, or multiple causes. Confirm the decision register below and produce approved customer/app wireframes. A static code hypothesis is not an incident diagnosis.

### 2. Repair earning and consistent reads

Fix availability policy, historical program visibility, multi-program summaries, error states, lifecycle durability, historical version selection, and refresh revision handling. Add invariant and lifecycle regression tests before behavior changes.

Exit: the earn → unlock → redeem → earn-again journey produces identical accounting results across supported backends, even with retries and delayed events.

### 3. Ship activity and owner investigations

Add atomic missing audit transitions, indexed activity queries, direct member lookup, accurate aggregates, granular permissions, and order earning explanations. Deliver activity/member investigation screens to web and mobile together.

Exit: an authorized owner can explain a disputed stamp and identify a reward redemption from either device, with linked evidence and safe corrective actions.

### 4. Rebuild customer and owner presentation

Implement the approved shared state vocabulary and design tokens, separate next-card progress from rewards, add customer history/missing-stamp review, replace ambiguous confirmation flows, and finish mobile focus/reconnect behavior.

Exit: all required states are visually reviewed with realistic data, small screens, large text, reduced motion, and keyboard/screen reader behavior. A user can identify what happened and what to do next without support.

### 5. Finish redemption and recovery coverage

Deliver remaining required cart/payment adapters and lost-response recovery. Finish verified identity recovery, late-claim policy, staff-assisted redemption rules, and refund cases. Do not label the program complete while required sales channels remain unsupported.

Exit: supported combinations are tested end to end; incompatible combinations are explicit and approved as scope limits rather than undisclosed restrictions.

### 6. Reconcile existing data and release

Generate a read-only discrepancy report first. Compare qualifying source orders with actual earning and reversals, using historical rules. Dry-run repairs, exclude ambiguous identities/timestamps, then replay proven missing business operations through the normal idempotent engine in audited batches. Do not directly replace balances.

Pilot per tenant with separate UI/earning/redemption controls; monitor delayed credit, failed recovery, reservation age, and owner/customer mismatch. Disabling new earning or redemption must still permit settlement recovery, history reads, and necessary refunds. Preserve old client compatibility during web/app rollout.

Exit: all approved discrepancy batches reconciled, unresolved cases visible to operators, and pilot acceptance passed across web and app. No production migrations, repairs, or deployments are part of this planning task.

## Verification plan

- Unit/property checks: thresholds, surplus, multiple rewards, debt/reversal, expiry boundaries, normalization, availability, and public/private history redaction.
- SQL integration: atomic accounting/audit, idempotency, reservation races, corrections, tenant/branch permissions, refund restoration. Use real PostgreSQL multi-session tests for contention; PGlite alone is insufficient.
- Backend integration matrix: platform Supabase, tenant Supabase, Convex; POS and online; lost event, duplicate event, reordered event, delayed processing, program revision/pause, cancellation, refund, and historical replay.
- Customer journeys: first order, repeat order, threshold crossing, later order before/after redemption, multiple programs, restored reward, pending/ineligible distinction, session changes, and lost verification/settlement responses.
- Web/native parity: same member/order/reward fixtures produce equal semantic results; app refreshes on focus and reconnect; late responses cannot show another member's data.
- Operational UX: search large datasets, paginate history, filter/export matching records, investigate missing stamps, and apply permissioned corrections with reasons.
- Visual/accessibility review: phone and desktop layouts, long labels, empty/loading/error states, large thresholds, large text, reduced motion, focus, contrast, and touch targets.
- Release observations: target healthy-network convergence within 10 seconds of committed earning; investigate pending credit older than 5 minutes. Confirm operational targets against the deployed queue and backend capabilities rather than present them as existing guarantees.

Existing focused web, native, and SQL loyalty suites are the starting point. The linked implementation plan records subsequent local tests; this broad roadmap itself is not a claim of complete implementation.

## Decision register for the owner

Resolve these through a focused interview; do not ask the owner to make technical implementation choices.

| Decision | Recommended starting position | Why it matters |
| --- | --- | --- |
| Automatic or per-receipt earning? | Automatic when a number is linked; receipt attachment for anonymous orders. | Accepted: automatic linked-number earning; anonymous receipt attachment retains its existing policy. |
| Customer visual personality and app scope? | Warm branded customer card; clean operational owner app; existing merchant native app in scope. | Establishes the design brief. Asked asynchronously. |
| When does an online order earn? | On fulfilled completion; explicitly decide whether confirmed payment is also required. | Prevents promises that the accounting model does not fulfil. |
| Can customers link completed anonymous receipts? | Controlled review initially; consider a limited late-claim window with proof. | Current attachment window closes at completion. |
| Can customers earn on orders using rewards or vouchers? | Eligible paid merchandise after discounts; no earning on the free benefit itself. | Changes spend qualification and points. |
| Do business and branch programs stack? | Preserve existing stacking for current programs; make future choice explicit. | Current engine stacks earning while some screens show one program. |
| What happens to an in-progress card after rule changes? | Honour its existing promise through the current cycle; new cycles use new rules. | Requires versioned progress policy and migration design before enforcement. |
| Do stamps expire, and when do rewards expire? | No new stamp expiry; retain current reward expiry until deliberately revised. | Prevents retroactive loss of value. |
| What may cashiers do without an owner? | View scoped progress and redeem verified rewards; corrections/voids require separate permission. | Determines permission and recovery flows. |
| How should partial refunds and spent-reward debt work? | Recalculate earning; preserve auditable debt; no automatic partial restoration without a clear policy. | Prevents duplicate value and unexplained balances. |
| Which redemption channels are launch requirements? | POS and customer online checkout; list every required cart/payment combination explicitly. | Existing canonical redemption has substantial cart restrictions. |
| Which owner outcome matters most? | Start with reliable repeat visits, used rewards, actual reward cost, and unresolved issues. | Keeps the overview useful and avoids decorative metrics. |

Core consistency, automatic recovery and owner activity have since been implemented locally. The linked implementation plan distinguishes these delivered changes from the remaining business decisions and product work.
