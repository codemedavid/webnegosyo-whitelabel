/**
 * Store activity vocabulary — categories, kinds, routine kinds, flags.
 *
 * Closed lists, mirrored from the database CHECKs in
 * supabase/migrations/20261012150000_store_activity.sql and the contract
 * (docs/plans/store-activity/contract.md). Tests read the migration text and
 * the contract table, so a kind added on one side only fails CI instead of
 * being silently refused by the database.
 *
 * Kept byte-identical in webnegosyo-app/lib/activity/taxonomy.ts (parity test).
 */

export const ACTIVITY_CATEGORIES = ['orders', 'money', 'cash', 'stock', 'loyalty', 'menu', 'team', 'approvals'] as const

export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number]

export const KINDS_BY_CATEGORY = {
  orders: [
    'order.cancelled',
    'order.reopened',
    'order.edited',
    'order.deleted',
    'order.placed',
    'order.status_changed',
    'order.completed',
  ],
  money: [
    'refund.issued',
    'payment.recorded',
    'payment.marked_paid',
    'payment.proof_approved',
    'payment.proof_rejected',
    'discount.applied',
    'voucher.redeemed',
    'voucher.released',
    'payment.charged',
  ],
  cash: ['shift.opened', 'shift.closed', 'cash.pay_in', 'cash.pay_out', 'cash.collected', 'receipt.reprinted'],
  stock: [
    'stock.received',
    'stock.wasted',
    'stock.counted',
    'stock.adjusted',
    'stock.transfer_sent',
    'stock.transfer_received',
    'stock.duplicate_blocked',
    'stock.alert',
    'stock.sale',
    'stock.restored',
  ],
  loyalty: [
    'loyalty.reward_claimed',
    'loyalty.reward_voided',
    'loyalty.stamps_adjusted',
    'loyalty.program_changed',
    'loyalty.stamps_earned',
    'loyalty.reward_issued',
  ],
  menu: ['menu.price_changed', 'menu.availability_changed', 'menu.item_added', 'menu.item_removed'],
  team: [
    'staff.added',
    'staff.removed',
    'staff.access_changed',
    'settings.changed',
    'rules.changed',
    'assistant.action_confirmed',
    'campaign.status_changed',
    'voucher.status_changed',
  ],
  approvals: [
    'approval.requested',
    'approval.approved',
    'approval.declined',
    'approval.expired',
    'approval.withdrawn',
    'approval.executed',
    'approval.failed',
  ],
} as const satisfies Record<ActivityCategory, readonly string[]>

export type ActivityKind = (typeof KINDS_BY_CATEGORY)[ActivityCategory][number]

export const ACTIVITY_KINDS: readonly ActivityKind[] = ACTIVITY_CATEGORIES.flatMap(
  (category) => KINDS_BY_CATEGORY[category] as readonly ActivityKind[],
)

/** Folded into roll-ups by readers unless asked for. */
export const ROUTINE_KINDS: ReadonlySet<ActivityKind> = new Set<ActivityKind>([
  'order.placed',
  'order.status_changed',
  'order.completed',
  'payment.charged',
  'stock.sale',
  'stock.restored',
  'loyalty.stamps_earned',
  'loyalty.reward_issued',
])

export const ACTIVITY_FLAGS = [
  'paid_then_cancelled',
  'cash_refund_noncash_order',
  'after_hours',
  'drawer_variance',
  'removed_after_kitchen',
  'repeat_cancels',
  'count_variance',
  'duplicate_deduction',
] as const

export type ActivityFlag = (typeof ACTIVITY_FLAGS)[number]

export const SUBJECT_TYPES = [
  'order',
  'ingredient',
  'menu_item',
  'shift',
  'member',
  'voucher',
  'staff',
  'setting',
  'approval',
  'count',
  'transfer',
] as const

export type ActivitySubjectType = (typeof SUBJECT_TYPES)[number]

/** The thresholds the SQL flag rules use (copy below must agree). */
export const FLAG_THRESHOLDS = {
  drawerVariancePesos: 100,
  countVariancePercent: 10,
  repeatCancelsPerDay: 3,
} as const

export interface FlagCopy {
  /** The chip is always the same word: flags describe events, never people. */
  chip: 'Check'
  explanation: string
}

/** Design spec §4. Shown in the detail sheet under "Needs a look". */
export const FLAG_COPY: Readonly<Record<ActivityFlag, FlagCopy>> = {
  paid_then_cancelled: { chip: 'Check', explanation: 'Cancelled after it was paid, and no refund has been recorded yet.' },
  cash_refund_noncash_order: { chip: 'Check', explanation: 'Refunded in cash, but the customer paid by GCash, Maya or card.' },
  after_hours: { chip: 'Check', explanation: 'Done after the shift or the store had closed.' },
  drawer_variance: { chip: 'Check', explanation: 'Drawer counted ₱100 or more away from what was expected.' },
  removed_after_kitchen: { chip: 'Check', explanation: 'Items were removed after the kitchen already had them.' },
  repeat_cancels: { chip: 'Check', explanation: "Third cancel by the same person today. Usually it's 0–1." },
  count_variance: { chip: 'Check', explanation: 'Stock count off by more than 10% for this item.' },
  duplicate_deduction: {
    chip: 'Check',
    explanation: 'A second stock deduction for this order was blocked. Stock is correct, but worth knowing.',
  },
}

export const CATEGORY_LABELS: Readonly<Record<ActivityCategory, string>> = {
  orders: 'Orders',
  money: 'Money',
  cash: 'Cash',
  stock: 'Stock',
  loyalty: 'Loyalty',
  menu: 'Menu',
  team: 'Team',
  approvals: 'Approvals',
}

const KIND_SET: ReadonlySet<string> = new Set(ACTIVITY_KINDS)
const FLAG_SET: ReadonlySet<string> = new Set(ACTIVITY_FLAGS)
const CATEGORY_SET: ReadonlySet<string> = new Set(ACTIVITY_CATEGORIES)
const SUBJECT_SET: ReadonlySet<string> = new Set(SUBJECT_TYPES)

const CATEGORY_OF_KIND: ReadonlyMap<string, ActivityCategory> = new Map(
  ACTIVITY_CATEGORIES.flatMap((category) =>
    KINDS_BY_CATEGORY[category].map((kind): [string, ActivityCategory] => [kind, category]),
  ),
)

export function isActivityKind(value: unknown): value is ActivityKind {
  return typeof value === 'string' && KIND_SET.has(value)
}

export function isActivityFlag(value: unknown): value is ActivityFlag {
  return typeof value === 'string' && FLAG_SET.has(value)
}

export function isActivityCategory(value: unknown): value is ActivityCategory {
  return typeof value === 'string' && CATEGORY_SET.has(value)
}

export function isActivitySubjectType(value: unknown): value is ActivitySubjectType {
  return typeof value === 'string' && SUBJECT_SET.has(value)
}

export function categoryOfKind(kind: ActivityKind): ActivityCategory {
  const category = CATEGORY_OF_KIND.get(kind)
  if (!category) throw new Error(`Unknown store activity kind: ${kind}`)
  return category
}

export function isRoutineKind(kind: ActivityKind): boolean {
  return ROUTINE_KINDS.has(kind)
}
