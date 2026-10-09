/**
 * The wizard's working copy of the answers: flat, string-friendly fields the
 * inputs bind to, turned into validated `OnboardingAnswers` only on submit.
 * Pure, so the mapping (and each step's "can I continue?") is unit-tested.
 */

import {
  ONBOARDING_ORDER_TYPES,
  onboardingAnswersSchema,
  describeAnswersError,
  type OnboardingAnswers,
  type OnboardingOrderType,
} from '@/lib/onboarding/answers'
import { isStoreType, toStoreLook, type StoreLook, type StoreType } from '@/lib/onboarding/store-type'

export interface WizardDraft {
  storeName: string
  storeType: StoreType | ''
  tagline: string
  /** '' = use the color read from the logo. */
  brandColor: string
  /** '' = let the build's AI pick from the menu. */
  look: StoreLook | ''
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
    storeName: businessName,
    storeType: '',
    tagline: '',
    brandColor: '',
    look: '',
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
    storeName: draft.storeName,
    storeType: draft.storeType,
    tagline: draft.tagline,
    brandColor: draft.brandColor || null,
    look: draft.look || undefined,
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

export const WIZARD_STEPS = ['welcome', 'store', 'brand', 'menu', 'ordering', 'hours', 'account'] as const
export type WizardStep = (typeof WIZARD_STEPS)[number]

/** Why the buyer cannot leave this step yet, or null. Checked before "Next". */
export function stepBlocker(step: WizardStep, draft: WizardDraft, menuPhotoCount: number): string | null {
  switch (step) {
    case 'welcome':
    case 'brand':
      // A logo is optional: the store type's color stands in until one is added.
      return null
    case 'store':
      if (draft.storeName.trim().length < 2) return 'Enter your store name'
      return draft.storeType ? null : 'Pick what kind of store you run'
    case 'menu':
      return menuPhotoCount > 0 || draft.menuText.trim() ? null : 'Add a photo of your menu, or type it in'
    case 'ordering': {
      if (draft.orderTypes.length === 0) return 'Pick at least one way to order'
      const hasWallet = !!draft.gcashNumber.trim() || !!draft.mayaNumber.trim()
      if (!draft.acceptsCash && !hasWallet) return 'Pick at least one way to pay'
      if (draft.gcashNumber.trim() && !draft.gcashName.trim()) return 'Enter the GCash account name'
      if (draft.mayaNumber.trim() && !draft.mayaName.trim()) return 'Enter the Maya account name'
      return null
    }
    case 'hours':
      // Store hours cannot cross midnight yet: such a window silently falls back to the default.
      return draft.close > draft.open ? null : 'Closing time must be later than opening time (same day)'
    case 'account':
      return null
  }
}

function isStringTriple(value: unknown): value is [string, string, string] {
  return Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'string')
}

function isArrayOf(value: unknown, isItem: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(isItem)
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
    const current = fallback[key]
    if (value === undefined) continue
    if (key === 'bestSellers') {
      if (isStringTriple(value)) restored[key] = value
    } else if (key === 'orderTypes') {
      if (isArrayOf(value, (item) => (ONBOARDING_ORDER_TYPES as readonly unknown[]).includes(item))) restored[key] = value
    } else if (key === 'storeType') {
      if (value === '' || isStoreType(value)) restored[key] = value
    } else if (key === 'look') {
      const look = value === '' ? '' : toStoreLook(value)
      if (look !== null) restored[key] = look
    } else if (key === 'brandColor') {
      if (value === '' || (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value))) restored[key] = value
    } else if (key === 'closedDays') {
      if (isArrayOf(value, (item) => Number.isInteger(item) && (item as number) >= 0 && (item as number) <= 6)) restored[key] = value
    } else if (typeof value === typeof current) {
      restored[key] = value
    }
  }
  return { ...fallback, ...(restored as Partial<WizardDraft>) }
}
