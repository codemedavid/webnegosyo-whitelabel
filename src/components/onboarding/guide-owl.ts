import type { OwlLook, OwlState } from '@/components/mascot/owl-markup'
import type { WizardStep } from '@/lib/onboarding/wizard-steps'
import type { WizardDraft } from './wizard-draft'

interface GuideMoment {
  isSubmitting: boolean
  isUploadingMenu: boolean
  /** A short happy beat: the greeting on Welcome, or a tapped answer. */
  isReacting?: boolean
}

/** One beat: two hops of the happy state (owl.module.css `hop`, 0.9s each). */
export const GUIDE_BEAT_MS = 1800

/** Steps where Owl reacts; every other step he simply rests beside the question. */
const STEP_MOODS: Partial<Record<WizardStep, OwlState>> = {
  plan: 'happy',
  menu: 'waiting',
  account: 'waiting',
}

/** What Owl, the set-up guide, is doing on a wizard step. Work in flight beats a cheer. */
export function guideOwlState(step: WizardStep, { isSubmitting, isUploadingMenu, isReacting = false }: GuideMoment): OwlState {
  if (isSubmitting || (step === 'menu' && isUploadingMenu)) return 'thinking'
  if (isReacting) return 'happy'
  return STEP_MOODS[step] ?? 'idle'
}

/**
 * Where Owl looks: up at the greeting on Welcome, down at the answers on a
 * question. Only while he rests with open eyes; every other state moves (or
 * closes) the eyes itself.
 */
export function guideOwlLook(step: WizardStep, state: OwlState): OwlLook | undefined {
  if (state !== 'idle') return undefined
  return step === 'welcome' ? 'up' : 'down'
}

/** Answers given with one tap. Typing, dragging a color or uploading never makes him hop. */
const TAP_FIELDS: ReadonlySet<keyof WizardDraft> = new Set<keyof WizardDraft>([
  'goals', 'channels', 'dailyOrders', 'typicalOrder', 'storeType', 'orderTypes', 'acceptsCash',
])

export function isTapAnswer(patch: Partial<WizardDraft>): boolean {
  return (Object.keys(patch) as (keyof WizardDraft)[]).some((field) => TAP_FIELDS.has(field))
}

const REACTION_LINES = ['Ayos!', 'Nice!', 'Galing!', 'Sige!', 'Okay!'] as const

/** What Owl says on the n-th tap: short, and never the same twice in a row. */
export function reactionLine(count: number): string {
  const index = Math.abs(Math.trunc(count)) % REACTION_LINES.length
  return REACTION_LINES[Number.isFinite(index) ? index : 0]
}
