/**
 * The wizard's working copy of the answers: flat, string-friendly fields the
 * inputs bind to, turned into validated `OnboardingAnswers` only on submit.
 * Pure, so the mapping (and each step's "can I continue?") is unit-tested.
 */

import {
  MAX_BEST_SELLERS,
  ONBOARDING_ORDER_TYPES,
  onboardingAnswersSchema,
  describeAnswersError,
  type OnboardingAnswers,
  type OnboardingOrderType,
} from '@/lib/onboarding/answers'
import {
  CHANNEL_IDS,
  DAILY_ORDER_IDS,
  GOAL_IDS,
  TYPICAL_ORDER_IDS,
  type ChannelId,
  type DailyOrders,
  type GoalId,
  type TypicalOrder,
} from '@/lib/onboarding/goals'
import { isStoreType, type StoreType } from '@/lib/onboarding/store-type'

export interface WizardDraft {
  goals: GoalId[]
  channels: ChannelId[]
  dailyOrders: DailyOrders | ''
  typicalOrder: TypicalOrder | ''
  storeName: string
  storeType: StoreType | ''
  /** '' = use the color read from the logo. */
  brandColor: string
  menuText: string
  bestSellers: [string, string, string]
  orderTypes: OnboardingOrderType[]
  acceptsCash: boolean
  gcashNumber: string
  gcashName: string
  mayaNumber: string
  mayaName: string
  open: string
  close: string
  closedDays: number[]
  stopOrdersWhenClosed: boolean
}

export function emptyDraft(businessName: string): WizardDraft {
  return {
    goals: [],
    channels: [],
    dailyOrders: '',
    typicalOrder: '',
    storeName: businessName,
    storeType: '',
    brandColor: '',
    menuText: '',
    bestSellers: ['', '', ''],
    orderTypes: ['pickup', 'delivery'],
    acceptsCash: true,
    gcashNumber: '',
    gcashName: '',
    mayaNumber: '',
    mayaName: '',
    open: '09:00',
    close: '21:00',
    closedDays: [],
    stopOrdersWhenClosed: true,
  }
}

function wallet(number: string, accountName: string) {
  return number.trim() ? { number, accountName } : null
}

export function draftToAnswers(draft: WizardDraft): { ok: true; answers: OnboardingAnswers } | { ok: false; error: string } {
  const parsed = onboardingAnswersSchema.safeParse({
    goals: draft.goals,
    channels: draft.channels,
    dailyOrders: draft.dailyOrders || null,
    typicalOrder: draft.typicalOrder || null,
    storeName: draft.storeName,
    storeType: draft.storeType,
    brandColor: draft.brandColor || null,
    menuText: draft.menuText,
    bestSellers: draft.bestSellers.map((name) => name.trim()).filter(Boolean),
    orderTypes: draft.orderTypes,
    payments: {
      cash: draft.acceptsCash,
      gcash: wallet(draft.gcashNumber, draft.gcashName),
      maya: wallet(draft.mayaNumber, draft.mayaName),
    },
    hours: {
      open: draft.open,
      close: draft.close,
      closedDays: draft.closedDays,
      stopOrdersWhenClosed: draft.stopOrdersWhenClosed,
    },
  })
  return parsed.success ? { ok: true, answers: parsed.data } : { ok: false, error: describeAnswersError(parsed.error) }
}

/**
 * One question a screen, in three chapters. Best sellers come late on purpose:
 * the menu is read in the background from the menu step on, so by then the
 * owner taps their best sellers from their own dishes instead of typing them.
 */
export const WIZARD_STEPS = [
  'welcome',
  'goals', 'channels', 'daily', 'typical', 'plan',
  'store', 'brand', 'menu', 'ordering', 'payments', 'hours', 'bestsellers',
  'account',
] as const
export type WizardStep = (typeof WIZARD_STEPS)[number]

export const WIZARD_CHAPTERS = [
  { id: 'about', label: 'About you', steps: ['goals', 'channels', 'daily', 'typical', 'plan'] },
  { id: 'store', label: 'Your store', steps: ['store', 'brand', 'menu', 'ordering', 'payments', 'hours', 'bestsellers'] },
  { id: 'live', label: 'Go live', steps: ['account'] },
] as const satisfies ReadonlyArray<{ id: string; label: string; steps: readonly WizardStep[] }>

/** One tap answers these, so the wizard moves on by itself. */
export const AUTO_ADVANCE_STEPS: ReadonlySet<WizardStep> = new Set(['daily', 'typical'])

/** Paying is step one: the bar starts part-filled (endowed progress). */
export const PAID_PROGRESS_SHARE = 0.08

/**
 * How far along the set-up is, 0..1, counting every question equally and
 * starting part-filled because the buyer has already paid.
 */
export function wizardProgress(step: WizardStep): number {
  const questions = WIZARD_STEPS.filter((id) => id !== 'welcome')
  const index = questions.indexOf(step as (typeof questions)[number])
  if (index < 0) return PAID_PROGRESS_SHARE
  return PAID_PROGRESS_SHARE + (1 - PAID_PROGRESS_SHARE) * (index / questions.length)
}

export function chapterOf(step: WizardStep): (typeof WIZARD_CHAPTERS)[number] | null {
  return WIZARD_CHAPTERS.find((chapter) => (chapter.steps as readonly WizardStep[]).includes(step)) ?? null
}

/** "Not open yet" means no other channel; picking a channel means it is open. */
export function toggleChannel(channels: readonly ChannelId[], channel: ChannelId): ChannelId[] {
  if (channels.includes(channel)) return channels.filter((item) => item !== channel)
  if (channel === 'not_open') return ['not_open']
  return [...channels.filter((item) => item !== 'not_open'), channel]
}

const foldName = (value: string) => value.trim().toLowerCase()

/** Keep the three slots, filled first: ['Adobo', '', 'Sisig'] → ['Adobo', 'Sisig', '']. */
function compactBestSellers(names: readonly string[]): WizardDraft['bestSellers'] {
  const filled = names.map((name) => name.trim()).filter(Boolean).slice(0, MAX_BEST_SELLERS)
  return [filled[0] ?? '', filled[1] ?? '', filled[2] ?? '']
}

/** Tap a dish: on (into the next free slot, never a fourth) or off again. */
export function toggleBestSeller(current: WizardDraft['bestSellers'], name: string): WizardDraft['bestSellers'] {
  const picked = current.filter((item) => item.trim())
  if (picked.some((item) => foldName(item) === foldName(name))) return compactBestSellers(picked.filter((item) => foldName(item) !== foldName(name)))
  if (picked.length >= MAX_BEST_SELLERS) return current
  return compactBestSellers([...picked, name])
}

export function toggleGoal(goals: readonly GoalId[], goal: GoalId): GoalId[] {
  return goals.includes(goal) ? goals.filter((item) => item !== goal) : [...goals, goal]
}

function paymentsBlocker(draft: WizardDraft): string | null {
  const hasWallet = !!draft.gcashNumber.trim() || !!draft.mayaNumber.trim()
  if (!draft.acceptsCash && !hasWallet) return 'Pick at least one way to pay'
  if (draft.gcashNumber.trim() && !draft.gcashName.trim()) return 'Enter the GCash account name'
  if (draft.mayaNumber.trim() && !draft.mayaName.trim()) return 'Enter the Maya account name'
  return null
}

/** Why the buyer cannot leave this step yet, or null. Checked before "Continue". */
export function stepBlocker(step: WizardStep, draft: WizardDraft, menuPhotoCount: number): string | null {
  switch (step) {
    case 'goals':
      return draft.goals.length > 0 ? null : 'Pick at least one'
    case 'channels':
      return draft.channels.length > 0 ? null : 'Pick at least one'
    case 'daily':
      return draft.dailyOrders ? null : 'Pick the closest one'
    case 'typical':
      return draft.typicalOrder ? null : 'Pick the closest one'
    case 'store':
      if (draft.storeName.trim().length < 2) return 'Enter your store name'
      return draft.storeType ? null : 'Pick what kind of store you run'
    case 'menu':
      return menuPhotoCount > 0 || draft.menuText.trim() ? null : 'Add a photo of your menu, or type it in'
    case 'ordering':
      return draft.orderTypes.length > 0 ? null : 'Pick at least one way to order'
    case 'payments':
      return paymentsBlocker(draft)
    case 'hours':
      // Store hours cannot cross midnight yet: such a window silently falls back to the default.
      return draft.close > draft.open ? null : 'Closing time must be later than opening time (same day)'
    case 'welcome':
    case 'plan':
    case 'brand':
    case 'bestsellers':
    case 'account':
      return null
  }
}

/** The first step a restored draft has not answered yet, so a reload resumes where they were. */
export function firstUnansweredStep(draft: WizardDraft, menuPhotoCount: number): WizardStep {
  const questions = WIZARD_STEPS.filter((step) => step !== 'welcome')
  return questions.find((step) => stepBlocker(step, draft, menuPhotoCount) !== null) ?? 'account'
}

function isStringTriple(value: unknown): value is [string, string, string] {
  return Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'string')
}

function isArrayOf(value: unknown, isItem: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(isItem)
}

const isOneOf = (options: readonly string[]) => (item: unknown) => typeof item === 'string' && options.includes(item)

/** Per-field shape checks for a draft read back from the browser. */
const RESTORE_CHECKS: Partial<Record<keyof WizardDraft, (value: unknown) => boolean>> = {
  goals: (value) => isArrayOf(value, isOneOf(GOAL_IDS)),
  channels: (value) => isArrayOf(value, isOneOf(CHANNEL_IDS)),
  dailyOrders: (value) => value === '' || isOneOf(DAILY_ORDER_IDS)(value),
  typicalOrder: (value) => value === '' || isOneOf(TYPICAL_ORDER_IDS)(value),
  bestSellers: isStringTriple,
  orderTypes: (value) => isArrayOf(value, isOneOf(ONBOARDING_ORDER_TYPES)),
  storeType: (value) => value === '' || isStoreType(value),
  brandColor: (value) => value === '' || (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)),
  closedDays: (value) => isArrayOf(value, (item) => Number.isInteger(item) && (item as number) >= 0 && (item as number) <= 6),
}

/**
 * Merge a draft saved in the browser over `fallback`, keeping only fields whose
 * shape still matches. A draft written by an older wizard (or tampered with)
 * must never crash the form, e.g. `bestSellers` that is not three strings.
 */
export function restoreDraft(fallback: WizardDraft, saved: unknown): WizardDraft {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return fallback
  const source = saved as Record<string, unknown>
  const restored: Record<string, unknown> = {}
  for (const key of Object.keys(fallback) as (keyof WizardDraft)[]) {
    const value = source[key]
    if (value === undefined) continue
    const check = RESTORE_CHECKS[key]
    const isValid = check ? check(value) : typeof value === typeof fallback[key]
    if (isValid) restored[key] = value
  }
  return { ...fallback, ...(restored as Partial<WizardDraft>) }
}
