/**
 * Customer identity + profile derivation (web / Supabase side).
 *
 * Two responsibilities, both pure and side-effect free so they can be shared by
 * the going-forward upsert and the idempotent backfill:
 *   1. resolveCustomerIdentity — turn a raw order's contact fields into a stable
 *      identity key (normalized phone first, email fallback).
 *   2. computeCustomerAggregate — reduce a customer's orders into the stored
 *      profile (counts, spend, recency, channels, top items, consent).
 *
 * The convex-template keeps a parity-tested mirror of this logic because it is a
 * separately-bundled deployment and cannot import from `src/`.
 */
import { normalizePhoneE164 } from '@/lib/phone'

/** Contacts that identify nobody — anonymous POS / walk-in orders. */
const PLACEHOLDER_CONTACTS = new Set([
  'pos',
  'walk-in',
  'walkin',
  'walk in',
  'n/a',
  'na',
  'none',
  'unknown',
  'guest',
  '-',
  '--',
])

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface CustomerIdentityInput {
  name?: string | null
  contact?: string | null
  customerData?: Record<string, unknown> | null
}

export interface CustomerIdentity {
  phoneE164: string | null
  email: string | null
  name: string | null
  /** Stable dedupe key, e.g. `phone:+639171234567` or `email:ana@x.com`; null if unidentifiable. */
  identityKey: string | null
}

export interface CustomerOrderItemInput {
  name: string
  quantity: number
}

export interface CustomerOrderInput {
  total: number
  /** ISO string or epoch milliseconds (Convex `_creationTime`). */
  createdAt: string | number
  channel?: string | null
  items?: CustomerOrderItemInput[]
  smsConsent?: boolean
}

export interface CustomerAggregate {
  orderCount: number
  totalSpent: number
  averageOrderValue: number
  firstOrderAt: string | null
  lastOrderAt: string | null
  channelsUsed: string[]
  topItems: CustomerOrderItemInput[]
  smsConsent: boolean
  smsConsentAt: string | null
}

const DEFAULT_TOP_ITEMS = 5

/** True when the contact string can identify a real, reachable person. */
export function isIdentifiableContact(contact: string | null | undefined): boolean {
  if (!contact) return false
  const key = contact.trim().toLowerCase()
  if (!key) return false
  return !PLACEHOLDER_CONTACTS.has(key)
}

function pickString(data: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!data) return null
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return null
}

function normalizeEmail(raw: string | null): string | null {
  if (!raw) return null
  const email = raw.trim().toLowerCase()
  return EMAIL_RE.test(email) ? email : null
}

/**
 * Resolve the identity of the customer behind an order. Phone (normalized E.164)
 * is the primary key; a valid email is the fallback. Placeholder/blank contacts
 * yield a null identity so anonymous orders never become a customer.
 */
export function resolveCustomerIdentity(input: CustomerIdentityInput): CustomerIdentity {
  const name =
    pickString(input.customerData, ['customer_name', 'name']) ??
    (input.name && input.name.trim() !== '' ? input.name.trim() : null)

  const phoneCandidate =
    pickString(input.customerData, ['customer_phone', 'phone', 'mobile', 'contact_number']) ??
    (isIdentifiableContact(input.contact) ? input.contact ?? null : null)

  const emailCandidate =
    pickString(input.customerData, ['customer_email', 'email']) ??
    (isIdentifiableContact(input.contact) ? input.contact ?? null : null)

  const phoneE164 = normalizePhoneE164(phoneCandidate)
  const email = normalizeEmail(emailCandidate)

  const identityKey = phoneE164
    ? `phone:${phoneE164}`
    : email
      ? `email:${email}`
      : null

  return { phoneE164, email, name, identityKey }
}

/**
 * The canonical value to store in an order's `customerContact`.
 *
 * Every order write path (web checkout, QR handoff, mobile, server upsert) must
 * funnel through this so the stored contact is a stable identity — normalized
 * E.164 phone first, then a valid email — regardless of which form field the
 * tenant named their phone/email input. Returns `''` (never a placeholder or a
 * junk value) when the order is genuinely anonymous, so downstream analytics
 * count it as a walk-in instead of collapsing many orders into one fake customer.
 */
export function resolveOrderContact(input: CustomerIdentityInput): string {
  const { phoneE164, email } = resolveCustomerIdentity(input)
  return phoneE164 ?? email ?? ''
}

function toIso(value: string | number): string | null {
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  const ms = date.getTime()
  return Number.isNaN(ms) ? null : date.toISOString()
}

/**
 * Reduce a customer's orders into their stored profile. Pure and deterministic:
 * calling it with the full order set always yields the same result, which is
 * what makes the backfill idempotent (recompute-then-upsert, never increment).
 */
export function computeCustomerAggregate(
  orders: CustomerOrderInput[],
  topItemsLimit: number = DEFAULT_TOP_ITEMS
): CustomerAggregate {
  let totalSpent = 0
  let firstMs = Number.POSITIVE_INFINITY
  let lastMs = Number.NEGATIVE_INFINITY
  let firstOrderAt: string | null = null
  let lastOrderAt: string | null = null
  const channelsUsed: string[] = []
  const seenChannels = new Set<string>()
  const itemQty = new Map<string, number>()
  let smsConsent = false
  let consentMs = Number.POSITIVE_INFINITY
  let smsConsentAt: string | null = null

  for (const order of orders) {
    totalSpent += Number(order.total) || 0

    const iso = toIso(order.createdAt)
    if (iso) {
      const ms = new Date(iso).getTime()
      if (ms < firstMs) {
        firstMs = ms
        firstOrderAt = iso
      }
      if (ms > lastMs) {
        lastMs = ms
        lastOrderAt = iso
      }
      if (order.smsConsent && ms < consentMs) {
        consentMs = ms
        smsConsentAt = iso
      }
    }

    if (order.smsConsent) smsConsent = true

    const channel = order.channel?.trim()
    if (channel && !seenChannels.has(channel)) {
      seenChannels.add(channel)
      channelsUsed.push(channel)
    }

    for (const item of order.items ?? []) {
      if (!item?.name) continue
      itemQty.set(item.name, (itemQty.get(item.name) ?? 0) + (Number(item.quantity) || 0))
    }
  }

  const orderCount = orders.length
  const averageOrderValue = orderCount > 0 ? round2(totalSpent / orderCount) : 0

  const topItems = Array.from(itemQty.entries())
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
    .slice(0, topItemsLimit)

  return {
    orderCount,
    totalSpent: round2(totalSpent),
    averageOrderValue,
    firstOrderAt,
    lastOrderAt,
    channelsUsed,
    topItems,
    smsConsent,
    smsConsentAt: smsConsent ? smsConsentAt : null,
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
