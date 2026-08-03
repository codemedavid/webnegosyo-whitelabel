/**
 * Cutting a merchant off, and letting them back in.
 *
 * The date-driven half of billing lives in `subscription-status.ts`, which
 * decides access from `paid_through` and grace. This is the manual override:
 * the platform owner's lever for a client who has stopped replying, applied
 * today rather than whenever the arithmetic gets round to it.
 *
 * Kept apart from `subscription-service.ts` because the invariant here is the
 * opposite one. `markPaid` exists to MOVE `paid_through`; these two must never
 * touch it. Money paid is money paid — a merchant paused mid-month gets their
 * remaining days back on resume, and a merchant resumed months after lapsing
 * gets no free time for having been paused.
 *
 * Pure logic over an injected store, so it is unit-testable against an
 * in-memory fake and only the server action layer holds Supabase.
 */

/** The subset of a `tenant_subscriptions` row this module reads and writes. */
export interface SubscriptionRow {
  tenant_id: string
  status: string
  monthly_price_php: number
  paid_through: string | null
  grace_days: number
  /** The date this client's month turns over, or null for pay-day billing. */
  billing_anchor_date: string | null
}

/**
 * The write seam.
 *
 * Structurally a subset of the store in `subscription-service.ts` — the same
 * Supabase store satisfies both — but declared here so this module does not
 * depend on the payment ledger it has no business writing to.
 */
export interface SubscriptionStore {
  getSubscription(tenantId: string): Promise<SubscriptionRow | null>
  upsertSubscription(tenantId: string, patch: Partial<SubscriptionRow>): Promise<void>
}

export interface LifecycleInput {
  tenantId: string
}

/**
 * The status a manual pause writes.
 *
 * `subscription-status.ts` treats this as terminal — it beats any date still
 * left on the row — so it is the only value that actually closes the door.
 */
const PAUSED_STATUS = 'paused'

/**
 * The status a resume writes.
 *
 * Not "whatever it was before": the row does not record that, and guessing
 * would risk restoring `cancelled`. `active` hands the verdict straight back to
 * the dates, which then decide honestly whether the merchant is current, in
 * grace, or lapsed.
 */
const RESUMED_STATUS = 'active'

function requireTenantId(input: LifecycleInput): string {
  if (typeof input.tenantId !== 'string' || input.tenantId.trim() === '') {
    throw new Error('A tenant is required to change a subscription')
  }
  return input.tenantId.trim()
}

/**
 * Closes a merchant's admin and app immediately, whatever their dates say.
 *
 * Upserts rather than updates, because a client who has never been billed is
 * exactly the one likely to need cutting off, and requiring a row to exist
 * first would make the lever unusable on them.
 *
 * Takes no clock, unlike the rest of billing: a manual pause is true the
 * instant it is made, and the dates it overrides are read elsewhere.
 */
export async function pauseSubscription(
  store: SubscriptionStore,
  input: LifecycleInput
): Promise<void> {
  const tenantId = requireTenantId(input)

  // Deliberately status-only: omitting `paid_through` from the patch is what
  // preserves the days the merchant already bought.
  await store.upsertSubscription(tenantId, { status: PAUSED_STATUS })
}

/**
 * Lifts a manual pause and returns the merchant to the date-driven verdict.
 *
 * Grants nothing. If their paid period ran out while they were paused, they are
 * overdue again the moment they are resumed — which is correct, and is why this
 * is not a substitute for recording a payment.
 */
export async function resumeSubscription(
  store: SubscriptionStore,
  input: LifecycleInput
): Promise<void> {
  const tenantId = requireTenantId(input)

  await store.upsertSubscription(tenantId, { status: RESUMED_STATUS })
}

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** A real `YYYY-MM-DD`, round-tripped so "2026-02-31" is rejected. */
function isDayKey(value: string): boolean {
  if (!DAY_KEY_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export interface BillingAnchorInput extends LifecycleInput {
  /** `YYYY-MM-DD`, or null to return the client to pay-day billing. */
  anchorDate: string | null
}

/**
 * Records the date a client's month turns over.
 *
 * Belongs with the pause lever rather than with `markPaid` because it shares
 * that module's invariant, and shares it harder: this GRANTS NOTHING. It must
 * never touch `paid_through` or `status`. A date field that quietly extended
 * access would be the cheapest way on this platform to give away service with
 * no ledger row to find it by — and the screen that calls this is the same one
 * where the owner marks people paid, so the two are one slip apart.
 *
 * Rejects a malformed date rather than storing it. The period arithmetic
 * silently ignores an anchor it cannot parse, so a stored junk value would
 * leave the merchant drifting while the screen displayed a start date — a lie
 * that looks like a working feature.
 */
export async function setBillingAnchor(
  store: SubscriptionStore,
  input: BillingAnchorInput
): Promise<void> {
  const tenantId = requireTenantId(input)

  if (input.anchorDate !== null && !isDayKey(input.anchorDate)) {
    throw new Error('A billing start date must be a real calendar date (YYYY-MM-DD)')
  }

  // Upserts, because the client most likely to need a start date is the one who
  // has just joined and has no subscription row yet.
  await store.upsertSubscription(tenantId, { billing_anchor_date: input.anchorDate })
}
