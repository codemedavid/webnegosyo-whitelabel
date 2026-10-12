/**
 * SMS automations — shared shapes.
 *
 * An automation is a RECIPE (what moment it reacts to) plus a few numbers the
 * owner can turn (`params`), a message, and how it runs. The server decides who
 * gets a text and writes one `sms_outbox` row per text; a phone only delivers.
 * See docs/plans/2026-10-12-sms-automations.md.
 */

export const RECIPE_IDS = [
  'review_request',
  'first_visit_followup',
  'loyalty_almost_there',
  'loyalty_reward_waiting',
  'loyalty_reward_expiring',
  'win_back',
  'regulars_gone_quiet',
] as const
export type RecipeId = (typeof RECIPE_IDS)[number]

export const RUN_MODES = ['auto', 'manual'] as const
export type RunMode = (typeof RUN_MODES)[number]

export const AUTOMATION_STATUSES = ['on', 'off'] as const
export type AutomationStatus = (typeof AUTOMATION_STATUSES)[number]

export const AUTOMATION_SOURCES = ['owner', 'ai', 'onboarding'] as const
export type AutomationSource = (typeof AUTOMATION_SOURCES)[number]

/**
 * The owner's knobs. Every field is optional on the row; the recipe's
 * defaults fill the gaps (`resolveParams`), so an old row keeps working when a
 * recipe gains a knob.
 */
export interface AutomationParams {
  /** review_request: hours after the order is placed. */
  delayHours?: number
  /** first_visit_followup, loyalty_*: days to wait. */
  delayDays?: number
  /** win_back, regulars_gone_quiet: days without an order. */
  inactiveDays?: number
  /** loyalty_almost_there: text when this many stamps/points or fewer are left. */
  remainingAtMost?: number
  /** Only guests with at least this many orders (review: 2 = repeat guests). */
  minOrderCount?: number
}

export interface AutomationRow {
  id: string
  tenant_id: string
  recipe: RecipeId
  name: string
  params: AutomationParams
  message_template: string
  run_mode: RunMode
  /** Null = the recipe's default. */
  reentry_days: number | null
  status: AutomationStatus
  source: AutomationSource
  created_at: string
  updated_at: string
}

export interface AutomationSettings {
  /** "HH:MM" Manila wall time. */
  quietHoursStart: string
  quietHoursEnd: string
  /** At most one automated text per guest every N days, across all automations. */
  guestCapDays: number
  /** Texts the store's phone may send per Manila day. */
  dailyLimit: number
  /** Appended to every automated text when set, e.g. "Reply STOP to stop texts". */
  optOutLine: string | null
  /** Google review / Facebook page link the review recipe sends. */
  reviewUrl: string | null
}

/** A guest as the planner sees them — only what a rule or a message needs. */
export interface GuestProfile {
  id: string
  name: string | null
  phone: string | null
  smsConsent: boolean
  smsOptOut: boolean
  orderCount: number
  totalSpent: number
  firstOrderAt: string | null
  lastOrderAt: string | null
  favoriteItem: string | null
}

/** Loyalty facts a loyalty recipe puts in its message. */
export interface LoyaltyFacts {
  /** "2 stamps" / "120 points". */
  progressLeft: string
  /** Whole number left to the next reward. */
  remaining: number
  /** "Free Iced Tea". */
  rewardName: string
  /** Manila date the reward stops being claimable, when it expires. */
  rewardExpiresAt: string | null
}

/**
 * One reason a guest qualifies for an automation, once. `occurrenceKey` is the
 * dedupe identity: the same guest can only ever get ONE text per key.
 */
export interface Candidate {
  guest: GuestProfile
  occurrenceKey: string
  /** When the guest started to qualify (the moment + the wait). */
  dueAt: string
  /** After this the text is pointless and must not go out. */
  expiresAt: string
  loyalty?: LoyaltyFacts
  /** Reward recipes: the text is dropped at send time once this is claimed. */
  entitlementId?: string
}

export const SKIP_REASONS = [
  'no_phone',
  'no_consent',
  'opted_out',
  'suppressed',
  'already_sent',
  'too_soon',
  'texted_recently',
  'missing_review_link',
  /** The message needs a value this guest lacks (e.g. an expiry on a reward that never expires). */
  'cannot_fill',
] as const
export type SkipReason = (typeof SKIP_REASONS)[number]

/** A row the planner wants in `sms_outbox`. */
export interface OutboxDraft {
  tenant_id: string
  automation_id: string
  recipe: RecipeId
  customer_id: string
  phone_e164: string
  body: string
  occurrence_key: string
  priority: number
  not_before: string
  expires_at: string
  /** Send-time exit: drop the text if the guest ordered after this instant. */
  exit_if_ordered_after: string | null
  entitlement_id: string | null
  source: 'auto' | 'run_now'
}

/** An earlier outbox row, for dedupe, re-entry and the per-guest cap. */
export interface HistoryRow {
  automation_id: string | null
  recipe: RecipeId
  customer_id: string | null
  phone_e164: string
  occurrence_key: string
  status: OutboxStatus
  created_at: string
  sent_at: string | null
}

export const OUTBOX_STATUSES = ['queued', 'claimed', 'sent', 'failed', 'cancelled', 'expired', 'skipped'] as const
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number]

export interface StoreContext {
  tenantId: string
  storeName: string
  /** Absolute, no trailing slash — the storefront root. */
  baseUrl: string
}
