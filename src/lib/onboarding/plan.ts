/**
 * Pure translations from the wizard's answers to what the store is built from.
 * No I/O, so every rule here is unit-tested directly.
 */

import type { OperatingHours } from '@/lib/operating-hours'
import type { OnboardingAnswers, OnboardingOrderType } from './answers'

/**
 * Top-level app routes and host labels a store slug must never take: path
 * routing serves `/<slug>/...`, so a store called "checkout" would shadow or be
 * shadowed by the platform's own pages.
 */
const RESERVED_STORE_SLUGS = new Set([
  'www', 'superadmin', 'app', 'admin', 'api', 'checkout', 'funnel', 'onboarding',
  'download', 'privacy', 'support', 'university', 'login', 'menu', '_next',
])

const MAX_SLUG_LENGTH = 40
const MIN_SLUG_LENGTH = 2
const FALLBACK_SLUG = 'store'

/** "Kape't Tinapay Café!" → "kapet-tinapay-cafe". Never empty, never reserved. */
export function baseSlugFromName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '')
  if (slug.length < MIN_SLUG_LENGTH) return FALLBACK_SLUG
  return RESERVED_STORE_SLUGS.has(slug) ? `${slug}-store` : slug
}

/** Candidates in the order to try: base, base-2, base-3 … */
export function slugCandidates(name: string, count = 20): string[] {
  const base = baseSlugFromName(name)
  return [base, ...Array.from({ length: count - 1 }, (_, i) => `${base}-${i + 2}`)]
}

/** The same window every open day; listed days closed. */
export function buildOperatingHours(hours: OnboardingAnswers['hours']): OperatingHours {
  const closed = new Set(hours.closedDays)
  return Object.fromEntries(
    Array.from({ length: 7 }, (_, day) => [
      String(day),
      { closed: closed.has(day), open: hours.open, close: hours.close },
    ]),
  )
}

export interface PaymentMethodPlan {
  name: string
  details: string
  /** E-wallet payments ask for a screenshot or reference so the owner can match them. */
  requirePaymentProof: boolean
  skipPaymentDetails: boolean
}

export function buildPaymentMethods(payments: OnboardingAnswers['payments']): PaymentMethodPlan[] {
  const wallets: PaymentMethodPlan[] = (
    [
      ['GCash', payments.gcash],
      ['Maya', payments.maya],
    ] as const
  ).flatMap(([name, wallet]) =>
    wallet
      ? [{
          name,
          details: `${name} ${wallet.number} — ${wallet.accountName}`,
          requirePaymentProof: true,
          skipPaymentDetails: false,
        }]
      : [],
  )
  const cash: PaymentMethodPlan[] = payments.cash
    ? [{ name: 'Cash', details: 'Pay in cash when you receive your order', requirePaymentProof: false, skipPaymentDetails: true }]
    : []
  return [...wallets, ...cash]
}

/** Which of the three default order types stay switched on. */
export function orderTypeToggles(chosen: readonly OnboardingOrderType[]): Record<OnboardingOrderType, boolean> {
  const set = new Set(chosen)
  return { dine_in: set.has('dine_in'), pickup: set.has('pickup'), delivery: set.has('delivery') }
}

function normalizeName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Match typed best sellers ("iced spanish latte") to imported items. Exact
 * name first, then one containing the other; each item is used once. A typed
 * name with no match is dropped rather than guessed.
 */
export function matchBestSellers(
  typed: readonly string[],
  items: ReadonlyArray<{ id: string; name: string }>,
): string[] {
  const normalized = items.map((item) => ({ id: item.id, name: normalizeName(item.name) }))
  const used = new Set<string>()
  const pick = (predicate: (name: string) => boolean): string | null => {
    const hit = normalized.find((item) => !used.has(item.id) && predicate(item.name))
    return hit ? hit.id : null
  }

  return typed.flatMap((raw) => {
    const wanted = normalizeName(raw)
    if (!wanted) return []
    const id =
      pick((name) => name === wanted) ??
      pick((name) => name.includes(wanted) || (name.length > 2 && wanted.includes(name)))
    if (!id) return []
    used.add(id)
    return [id]
  })
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

/**
 * The launch brand color: what the owner picked in the wizard, else the color
 * read from the logo when it was uploaded. Null leaves it to the build (a
 * fresh read of the logo, then the store type's default).
 */
export function pickLaunchBrandColor(picked: string | null | undefined, logoColor: string | null | undefined): string | null {
  const usable = [picked, logoColor].find((value) => typeof value === 'string' && HEX_COLOR.test(value))
  return usable ? usable.toLowerCase() : null
}

export const ONBOARDING_BUILD_STEPS = [
  { id: 'branding', label: 'Designing your store' },
  { id: 'menu', label: 'Reading your menu' },
  { id: 'store_setup', label: 'Setting up payments, hours and order types' },
  { id: 'boost', label: 'Creating combos and upsells' },
  { id: 'loyalty', label: 'Launching your loyalty stamp card' },
] as const

export type OnboardingBuildStepId = (typeof ONBOARDING_BUILD_STEPS)[number]['id']

export type StepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed'

export interface StepState {
  status: StepStatus
  detail?: string | null
  at?: string
}

export type OnboardingSteps = Partial<Record<OnboardingBuildStepId, StepState>>

/**
 * Offers and the loyalty reward are built FROM the menu. While the menu step
 * has failed they wait (stay pending) instead of settling as "skipped" — a
 * skipped step is never re-run, so a retry that fixes the menu would otherwise
 * leave the store with no offers and no stamp card.
 */
export const STEP_DEPENDENCIES: Partial<Record<OnboardingBuildStepId, OnboardingBuildStepId>> = {
  boost: 'menu',
  loyalty: 'menu',
}

export function isBlockedByDependency(steps: OnboardingSteps, id: OnboardingBuildStepId): boolean {
  const dependency = STEP_DEPENDENCIES[id]
  return !!dependency && steps[dependency]?.status === 'failed'
}

/** A step that already finished is never repeated on a retry. */
export function isStepSettled(steps: OnboardingSteps, id: OnboardingBuildStepId): boolean {
  const status = steps[id]?.status
  return status === 'done' || status === 'skipped'
}
