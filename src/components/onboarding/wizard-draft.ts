/**
 * The wizard's working copy of the answers: flat, string-friendly fields the
 * inputs bind to, turned into validated `OnboardingAnswers` only on submit.
 * Pure, so the mapping (and each step's "can I continue?") is unit-tested.
 */

import {
  onboardingAnswersSchema,
  describeAnswersError,
  type OnboardingAnswers,
  type OnboardingOrderType,
} from '@/lib/onboarding/answers'
import type { StoreType } from '@/lib/onboarding/store-type'

export interface WizardDraft {
  storeName: string
  storeType: StoreType | ''
  tagline: string
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

export const WIZARD_STEPS = ['store', 'menu', 'ordering', 'hours', 'account'] as const
export type WizardStep = (typeof WIZARD_STEPS)[number]

/** Why the buyer cannot leave this step yet, or null. Checked before "Next". */
export function stepBlocker(step: WizardStep, draft: WizardDraft, menuPhotoCount: number): string | null {
  switch (step) {
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
      return draft.open === draft.close ? 'Opening and closing time cannot be the same' : null
    case 'account':
      return null
  }
}
