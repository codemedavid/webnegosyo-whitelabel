/**
 * The automatic-text editor's state: the headline knob as a sentence, the
 * draft the API takes, and the message check. Ported from the merchant app's
 * lib/sms-automations/editor.ts + view.ts. Pure.
 */

import type { Automation, RecipeInfo } from './automations'

type ParamKey = 'delayHours' | 'delayDays' | 'inactiveDays' | 'remainingAtMost' | 'minOrderCount'
type Params = Partial<Record<ParamKey, number>>
type RunMode = Automation['runMode']

export const MAX_AUTOMATION_CHARS = 459
const COARSE_STEP = 5
const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

export interface AutomationDraft {
  recipe: RecipeInfo['id']
  name: string | null
  params: Params
  messageTemplate: string
  runMode: RunMode
  reentryDays: number | null
}

export function draftFromRecipe(info: RecipeInfo): AutomationDraft {
  return { recipe: info.id, name: null, params: { ...info.defaults }, messageTemplate: info.defaultMessage, runMode: 'auto', reentryDays: null }
}

export function draftFromAutomation(automation: Automation): AutomationDraft {
  return {
    recipe: automation.recipe, name: automation.name, params: { ...automation.params },
    messageTemplate: automation.messageTemplate, runMode: automation.runMode, reentryDays: automation.reentryDays,
  }
}

/** Exactly the `automation` body the app posts (an empty name lets the server use the title). */
export function toApiDraft(draft: AutomationDraft) {
  return {
    recipe: draft.recipe,
    ...(draft.name ? { name: draft.name } : {}),
    params: draft.params,
    messageTemplate: draft.messageTemplate,
    runMode: draft.runMode,
    reentryDays: draft.reentryDays,
  }
}

export interface Sentence {
  before: string
  knob: ParamKey
  unit: string
  after: string
}

const SENTENCES: Record<RecipeInfo['id'], Sentence> = {
  win_back: { before: 'Text guests who haven’t ordered in', knob: 'inactiveDays', unit: 'days', after: '' },
  regulars_gone_quiet: { before: 'Text regulars who haven’t ordered in', knob: 'inactiveDays', unit: 'days', after: '' },
  review_request: { before: 'Ask for a review', knob: 'delayHours', unit: 'hours', after: 'after an order' },
  first_visit_followup: { before: 'Thank first-timers', knob: 'delayDays', unit: 'days', after: 'after their first order' },
  loyalty_almost_there: { before: 'Text guests with', knob: 'remainingAtMost', unit: 'stamps or fewer', after: 'left to a reward' },
  loyalty_reward_waiting: { before: 'Remind guests of an unused reward', knob: 'delayDays', unit: 'days', after: 'after they earn it' },
  loyalty_reward_expiring: { before: 'Remind guests', knob: 'delayDays', unit: 'days', after: 'before a reward expires' },
}

export function sentenceFor(recipe: RecipeInfo['id']): Sentence {
  return SENTENCES[recipe]
}

export function unitFor(value: number, unit: string): string {
  if (value === 1 && unit === 'days') return 'day'
  if (value === 1 && unit === 'hours') return 'hour'
  return unit
}

export function knobValue(draft: AutomationDraft, knob: ParamKey, info: RecipeInfo): number {
  const defaults = info.defaults as Params
  const limits = info.limits as Partial<Record<ParamKey, [number, number]>>
  return draft.params[knob] ?? defaults[knob] ?? limits[knob]?.[0] ?? 0
}

export function knobLimits(info: RecipeInfo, knob: ParamKey): readonly [number, number] | undefined {
  return (info.limits as Partial<Record<ParamKey, [number, number]>>)[knob]
}

function clamp(value: number, limits: readonly [number, number] | undefined): number {
  return limits ? Math.min(limits[1], Math.max(limits[0], value)) : Math.max(0, value)
}

export function stepKnob(value: number, direction: 1 | -1, knob: ParamKey, limits: readonly [number, number] | undefined): number {
  if (knob !== 'inactiveDays') return clamp(value + direction, limits)
  const next = direction === 1
    ? Math.floor(value / COARSE_STEP) * COARSE_STEP + COARSE_STEP
    : Math.ceil(value / COARSE_STEP) * COARSE_STEP - COARSE_STEP
  return clamp(next, limits)
}

export function canStep(value: number, direction: 1 | -1, limits: readonly [number, number] | undefined): boolean {
  if (!limits) return direction === 1 || value > 0
  return direction === 1 ? value < limits[1] : value > limits[0]
}

export function automationMessageProblem(text: string, variables: readonly string[]): string | null {
  const trimmed = text.trim()
  if (trimmed === '') return 'Write a message first.'
  if (trimmed.length > MAX_AUTOMATION_CHARS) return 'Too long: keep it to 3 texts or less.'
  const unknown = [...trimmed.matchAll(PLACEHOLDER)].map((m) => m[1]).filter((name) => !variables.includes(name))
  if (unknown.length > 0) return `We don't know {{${unknown[0]}}}. Use the chips above.`
  if (/\{\{|\}\}/.test(trimmed.replace(PLACEHOLDER, ''))) return 'A word in {{ }} isn’t finished.'
  return null
}

export const VARIABLE_LABELS: Readonly<Record<string, string>> = {
  firstName: 'First name', name: 'Full name', storeName: 'Store name', orderCount: 'Orders so far',
  totalSpent: 'Total spent', lastOrderDate: 'Last order date', daysSinceLastOrder: 'Days since last order',
  favoriteItem: 'Favorite item', menuLink: 'Menu link', loyaltyLink: 'Rewards link', reviewLink: 'Review link',
  progressLeft: 'Stamps left', stampsLeft: 'Stamps left (number)', rewardName: 'Reward', rewardExpiryDate: 'Reward expiry date',
}

export function renderAutomationSample(template: string, storeName: string, slug: string): string {
  const base = `https://${slug || 'your-store'}.webnegosyo.com`
  const values: Record<string, string> = {
    firstName: 'Maria', name: 'Maria Santos', storeName, orderCount: '4', totalSpent: '1250', lastOrderDate: 'Sep 2, 2026',
    daysSinceLastOrder: '41', favoriteItem: 'Spanish Latte', menuLink: `${base}/menu`, loyaltyLink: `${base}/loyalty`,
    reviewLink: 'https://g.page/r/your-store', progressLeft: '2 stamps', stampsLeft: '2', rewardName: 'Free Iced Tea',
    rewardExpiryDate: 'Oct 20',
  }
  return template.replace(PLACEHOLDER, (match, name: string) => values[name] ?? match).trim()
}

export const RUN_MODE_OPTIONS: readonly { label: string; value: RunMode }[] = [
  { label: 'Send on its own', value: 'auto' },
  { label: 'Only when I tap Run now', value: 'manual' },
]
