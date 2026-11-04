/**
 * One store activity event → one sentence (design spec P2 + §4 copy deck).
 *
 * Line 1 (title) answers who did what: "Ana refunded #14 · R-0042".
 * Line 2 (subtitle) is the reason, the second name, and the branch when asked:
 * "Wrong item served · approved by Marco". Flags never enter the sentence —
 * they describe the event in the detail sheet, not the person (P8).
 *
 * Kept byte-identical in webnegosyo-app/lib/activity/describe.ts (parity test).
 */

import { formatPeso, formatQuantity, formatSignedPeso } from './format'
import type { ActivityJson, StoreActivityEvent } from './store-event'
import type { ActivityCategory, ActivityKind } from './taxonomy'

export type ActivityTone = 'negative' | 'positive' | 'warning' | 'neutral'

export type ActivityIcon =
  | 'order'
  | 'cancel'
  | 'refund'
  | 'money'
  | 'cash'
  | 'stock'
  | 'alert'
  | 'loyalty'
  | 'menu'
  | 'team'
  | 'approval'

export interface DescribedActivity {
  title: string
  subtitle: string
  amountLabel: string | null
  tone: ActivityTone
  icon: ActivityIcon
}

export interface DescribeOptions {
  /** Add the branch name to line 2 (when viewing all branches). */
  showBranch?: boolean
}

const STATUS_WORDS: Readonly<Record<string, string>> = {
  pending: 'pending',
  confirmed: 'confirmed',
  preparing: 'preparing',
  ready: 'ready',
  delivered: 'completed',
  cancelled: 'cancelled',
}

const DISCOUNT_WORDS: Readonly<Record<string, string>> = {
  senior: 'Senior',
  pwd: 'PWD',
  athlete: 'Athlete',
  medal_of_valor: 'Medal of Valor',
}

const CATEGORY_ICONS: Readonly<Record<ActivityCategory, ActivityIcon>> = {
  orders: 'order',
  money: 'money',
  cash: 'cash',
  stock: 'stock',
  loyalty: 'loyalty',
  menu: 'menu',
  team: 'team',
  approvals: 'approval',
  expenses: 'money',
}

const KIND_ICONS: Partial<Readonly<Record<ActivityKind, ActivityIcon>>> = {
  'order.cancelled': 'cancel',
  'refund.issued': 'refund',
  'stock.alert': 'alert',
  'stock.duplicate_blocked': 'alert',
  'expense.voided': 'cancel',
}

const WARNING_KINDS: ReadonlySet<ActivityKind> = new Set<ActivityKind>([
  'stock.alert',
  'stock.duplicate_blocked',
  'payment.proof_rejected',
  'approval.failed',
])

/** Kinds whose amount is a change, so a positive one reads "+₱10". */
const SIGNED_KINDS: ReadonlySet<ActivityKind> = new Set<ActivityKind>([
  'order.edited',
  'menu.price_changed',
  'stock.adjusted',
  'stock.counted',
])

/** Kinds whose line 1 is the stored sentence (settings-like changes). */
const STORED_TITLE_KINDS: ReadonlySet<ActivityKind> = new Set<ActivityKind>([
  'settings.changed',
  'rules.changed',
  'assistant.action_confirmed',
  'campaign.status_changed',
  'voucher.status_changed',
  'loyalty.program_changed',
  'stock.alert',
])

function text(json: ActivityJson | null, key: string): string | null {
  const value = json?.[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function num(json: ActivityJson | null, key: string): number | null {
  const value = json?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/** 'Ana Reyes' → 'Ana'; an email local part 'ana.reyes' → 'Ana'. */
export function actorFirstName(name: string | null): string | null {
  const first = (name ?? '').trim().split(/[\s._@-]+/).find((part) => part !== '')
  return first ? capitalise(first) : null
}

function quantityText(event: StoreActivityEvent): string {
  const quantity = event.quantity === null ? '' : formatQuantity(Math.abs(event.quantity))
  return [quantity, event.unit ?? ''].filter((part) => part !== '').join(' ')
}

function withThing(lead: string, thing: string | null): string {
  return thing ? `${lead} ${thing}` : lead
}

function orderTitle(event: StoreActivityEvent, who: string | null): string {
  const order = event.orderNumber ?? 'an order'
  const status = STATUS_WORDS[text(event.after, 'status') ?? ''] ?? 'updated'
  const count = event.quantity === null ? 'some' : formatQuantity(event.quantity)
  const action = text(event.summary, 'action')
  switch (event.kind) {
    case 'order.cancelled':
      return who ? `${who} cancelled ${order}` : `${order} was cancelled`
    case 'order.reopened':
      if (action === 'restored') return `${who ?? 'Someone'} restored ${count} deleted orders`
      return who ? `${who} reopened ${order}` : `${order} was reopened`
    case 'order.edited':
      return who ? `${who} edited ${order}` : `${order} was edited`
    case 'order.deleted':
      if (action === 'purged') return `${who ?? 'Someone'} permanently removed ${count} deleted orders`
      return `${who ?? 'Someone'} deleted ${count} orders`
    case 'order.placed':
      return who ? `${who} rang up ${order}` : `New order ${order}`
    case 'order.completed':
      return who ? `${who} completed ${order}` : `${order} was completed`
    default:
      return who ? `${who} marked ${order} ${status}` : `${order} is now ${status}`
  }
}

function moneyTitle(event: StoreActivityEvent, who: string | null): string {
  const actor = who ?? 'Someone'
  const order = event.orderNumber ?? 'an order'
  const code = text(event.summary, 'code')
  switch (event.kind) {
    case 'refund.issued': {
      const refundNumber = text(event.summary, 'refundNumber')
      return `${actor} refunded ${order}${refundNumber ? ` · ${refundNumber}` : ''}`
    }
    case 'payment.recorded':
      return `${actor} recorded a payment on ${order}`
    case 'payment.marked_paid':
      return `${actor} marked ${order} paid`
    case 'payment.proof_approved':
      return `${actor} approved the payment proof for ${order}`
    case 'payment.proof_rejected':
      return `${actor} rejected the payment proof for ${order}`
    case 'discount.applied': {
      const statutory = event.summary.statutory === true
      const word = statutory ? `${DISCOUNT_WORDS[text(event.summary, 'discountKind') ?? ''] ?? 'Senior/PWD'} ` : ''
      if (event.summary.reversed === true) return `${actor} removed a ${word}discount from ${order}`
      return `${actor} gave a ${word}discount on ${order}`
    }
    case 'voucher.redeemed':
      return `${withThing('Voucher', code)} used on ${order}`
    case 'voucher.released':
      return `${withThing('Voucher', code)} released from ${order}`
    default:
      return `${actor} took payment for ${order}`
  }
}

function cashTitle(event: StoreActivityEvent, who: string | null): string {
  const actor = who ?? 'Someone'
  switch (event.kind) {
    case 'shift.opened':
      return `${actor} opened a shift`
    case 'shift.closed':
      return `${actor} closed a shift`
    case 'cash.pay_in':
      return `${actor} added cash to the drawer`
    case 'cash.pay_out':
      return `${actor} took cash out of the drawer`
    case 'cash.collected':
      return `${actor} collected cash from the drawer`
    default:
      return `${actor} reprinted ${event.orderNumber ?? 'a'} receipt`
  }
}

function stockTitle(event: StoreActivityEvent, who: string | null): string {
  const actor = who ?? 'Someone'
  const item = text(event.summary, 'itemName') ?? 'stock'
  const amount = [quantityText(event), item].filter((part) => part !== '').join(' ')
  const order = event.orderNumber
  switch (event.kind) {
    case 'stock.received':
      return `${actor} received ${amount}`
    case 'stock.wasted':
      return `${actor} wrote off ${amount}`
    case 'stock.counted':
      return `${actor} closed a stock count`
    case 'stock.adjusted': {
      const to = num(event.after, 'quantity')
      return to === null ? `${actor} adjusted ${item}` : `${actor} set ${item} to ${[formatQuantity(to), event.unit].filter(Boolean).join(' ')}`
    }
    case 'stock.transfer_sent':
      return `${actor} sent stock to ${text(event.summary, 'toOutlet') ?? 'another branch'}`
    case 'stock.transfer_received':
      return `${actor} received stock from ${text(event.summary, 'fromOutlet') ?? 'another branch'}`
    case 'stock.duplicate_blocked':
      return `Blocked a second stock deduction${order ? ` for ${order}` : ''}`
    case 'stock.sale':
      return `${amount} used${order ? ` for ${order}` : ''}`
    default:
      return `${amount} returned${order ? ` from ${order}` : ''}`
  }
}

function loyaltyTitle(event: StoreActivityEvent, who: string | null): string {
  const reward = text(event.summary, 'reward')
  const count = event.quantity === null ? '' : formatQuantity(Math.abs(event.quantity))
  const unit = event.unit ?? 'stamps'
  const units = Math.abs(event.quantity ?? 0) === 1 ? unit.replace(/s$/, '') : unit
  switch (event.kind) {
    case 'loyalty.reward_claimed':
      return `${who ?? 'A guest'} redeemed a reward${reward ? `: ${reward}` : ''}`
    case 'loyalty.reward_voided':
      return `${who ?? 'Someone'} voided a reward${reward ? `: ${reward}` : ''}`
    case 'loyalty.stamps_adjusted':
      return `${who ?? 'Someone'} adjusted ${count} ${units}`.replace(/\s+/g, ' ')
    case 'loyalty.stamps_earned':
      return `${count} ${units} earned${event.orderNumber ? ` on ${event.orderNumber}` : ''}`.trim()
    default:
      return `Reward unlocked${reward ? `: ${reward}` : ''}`
  }
}

function menuTitle(event: StoreActivityEvent, who: string | null): string {
  const actor = who ?? 'Someone'
  const item = text(event.summary, 'itemName') ?? 'a dish'
  switch (event.kind) {
    case 'menu.price_changed':
      return `${actor} changed ${item}'s price`
    case 'menu.availability_changed': {
      const listed = event.after?.listed
      const available = event.after?.available
      if (listed === false) return `${actor} hid ${item} from the menu`
      if (listed === true && event.before?.listed === false) return `${actor} put ${item} back on the menu`
      return available === false ? `${actor} marked ${item} sold out` : `${actor} marked ${item} back in stock`
    }
    case 'menu.item_added':
      return `${actor} added ${item}`
    default:
      return `${actor} removed ${item}`
  }
}

function teamTitle(event: StoreActivityEvent, who: string | null): string {
  const actor = who ?? 'Someone'
  const staff = actorFirstName(text(event.summary, 'staffName')) ?? 'a staff member'
  switch (event.kind) {
    case 'staff.added':
      return `${actor} added ${staff} to the team`
    case 'staff.removed':
      return `${actor} removed ${staff} from the team`
    default:
      return `${actor} changed ${staff}'s access`
  }
}

function approvalTitle(event: StoreActivityEvent, who: string | null): string {
  const actor = who ?? 'Someone'
  switch (event.kind) {
    case 'approval.requested':
      return `${actor} asked for approval`
    case 'approval.approved':
      return `${actor} approved a request`
    case 'approval.declined':
      return `${actor} declined a request`
    case 'approval.expired':
      return 'A request expired'
    case 'approval.withdrawn':
      return `${actor} withdrew a request`
    case 'approval.executed':
      return 'An approved request went through'
    default:
      return "An approved request couldn't finish"
  }
}

function expenseTitle(event: StoreActivityEvent, who: string | null): string {
  const actor = who ?? 'Someone'
  const category = text(event.summary, 'categoryName')
  const what = category ? `an expense: ${category}` : 'an expense'
  return event.kind === 'expense.voided' ? `${actor} voided ${what}` : `${actor} recorded ${what}`
}

function titleOf(event: StoreActivityEvent): string {
  const who = actorFirstName(event.actorName)
  const stored = text(event.summary, 'title')
  if (STORED_TITLE_KINDS.has(event.kind) && stored) return stored
  switch (event.category) {
    case 'orders':
      return orderTitle(event, who)
    case 'money':
      return moneyTitle(event, who)
    case 'cash':
      return cashTitle(event, who)
    case 'stock':
      return stockTitle(event, who)
    case 'loyalty':
      return loyaltyTitle(event, who)
    case 'menu':
      return menuTitle(event, who)
    case 'approvals':
      return approvalTitle(event, who)
    case 'expenses':
      return expenseTitle(event, who)
    default:
      return event.kind.startsWith('staff.') ? teamTitle(event, who) : stored ?? 'Settings changed'
  }
}

function priceArrow(event: StoreActivityEvent): string | null {
  const before = num(event.before, 'price') ?? num(event.before, 'salePrice')
  const after = num(event.after, 'price') ?? num(event.after, 'salePrice')
  if (before === null || after === null) return null
  return `${formatPeso(before)} → ${formatPeso(after)}`
}

function drawerWords(amount: number | null): string | null {
  if (amount === null) return null
  if (Math.round(amount * 100) === 0) return 'Drawer exact'
  return amount < 0 ? `Drawer short ${formatPeso(-amount)}` : `Drawer over ${formatPeso(amount)}`
}

function removedItems(summary: ActivityJson): string | null {
  const removed = summary.removed
  if (!Array.isArray(removed) || removed.length === 0) return null
  return removed
    .map((line: unknown) => {
      const entry = (line ?? {}) as Record<string, unknown>
      const name = typeof entry.name === 'string' ? entry.name : 'Item'
      const quantity = typeof entry.quantity === 'number' ? formatQuantity(entry.quantity) : '1'
      return `−${quantity} ${name}`
    })
    .join(', ')
}

/** What line 2 says when nobody gave a reason. */
function detailOf(event: StoreActivityEvent): string | null {
  switch (event.kind) {
    case 'shift.closed':
      return drawerWords(event.amount)
    case 'menu.price_changed':
      return priceArrow(event)
    case 'order.edited':
      return removedItems(event.summary)
    case 'payment.recorded':
    case 'payment.marked_paid':
    case 'payment.charged':
    case 'refund.issued':
      return text(event.summary, 'paymentMethod')
    default:
      return STORED_TITLE_KINDS.has(event.kind) && event.actorName
        ? `by ${actorFirstName(event.actorName)}`
        : event.note
  }
}

function amountLabelOf(event: StoreActivityEvent): string | null {
  if (event.amount === null) return null
  const signed =
    event.category === 'money' || event.category === 'cash' || event.category === 'expenses' || SIGNED_KINDS.has(event.kind)
  return signed || event.amount < 0 ? formatSignedPeso(event.amount) : formatPeso(event.amount)
}

function toneOf(event: StoreActivityEvent): ActivityTone {
  if (WARNING_KINDS.has(event.kind)) return 'warning'
  if (event.amount !== null && event.amount < 0 && event.category !== 'orders' && event.category !== 'menu') {
    return 'negative'
  }
  if (event.amount !== null && event.amount > 0 && (event.category === 'money' || event.category === 'cash')) {
    return 'positive'
  }
  return 'neutral'
}

export function describeActivity(event: StoreActivityEvent, options: DescribeOptions = {}): DescribedActivity {
  const approver = actorFirstName(event.approvedByName)
  const parts = [
    event.reason ?? detailOf(event),
    approver ? `approved by ${approver}` : null,
    options.showBranch ? event.outletName : null,
  ].filter((part): part is string => typeof part === 'string' && part.trim() !== '')

  return {
    title: titleOf(event),
    subtitle: parts.join(' · '),
    amountLabel: amountLabelOf(event),
    tone: toneOf(event),
    icon: KIND_ICONS[event.kind] ?? CATEGORY_ICONS[event.category],
  }
}
