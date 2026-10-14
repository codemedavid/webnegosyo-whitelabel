/**
 * Automatic texts on the web, worded exactly like the merchant app's Texts
 * hub (ported from webnegosyo-app/lib/sms-automations/view.ts + editor.ts)
 * so the two never describe the same automation differently. Pure.
 */

import type { TextsPageData } from '../types'
import { estimateDeliveryFinish } from '@/lib/sms-automations/eta'
import { clockText, manilaDay, weekdayDateText } from './time'

export type AutomationsView = TextsPageData['automations']
export type Automation = AutomationsView['automations'][number]
export type RecipeInfo = AutomationsView['recipes'][number]
export type TextingRules = AutomationsView['settings']
export type DeliveryOutlook = AutomationsView['outlook']
type RecipeKey = RecipeInfo['id']

export type Blocker = { kind: 'review_link' | 'loyalty'; text: string }

const FEW_MINUTES_MS = 10 * 60_000

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

export function blockerFor(recipe: RecipeKey, view: AutomationsView): Blocker | null {
  const info = view.recipes.find((r) => r.id === recipe)
  if (info?.needsReviewLink && !view.settings.reviewUrl) return { kind: 'review_link', text: 'Add your review link to start' }
  if (info?.needsLoyalty && !view.loyaltyOn) return { kind: 'loyalty', text: 'Turn on Rewards to start' }
  return null
}

export function blockerFix(blocker: Blocker): { label: string; why: string } {
  if (blocker.kind === 'review_link') {
    return { label: 'Add your review link', why: 'This text sends guests to your review page, so it needs the link first.' }
  }
  return { label: 'Open Rewards', why: 'This text is about stamps and rewards, so your rewards program needs to be on.' }
}

/** The card's one line: what happened, or the one thing to fix. */
export function automationStatusLine(automation: Automation, view: AutomationsView): string {
  if (automation.status === 'off') return 'Off'
  const blocker = blockerFor(automation.recipe, view)
  if (blocker) return blocker.text
  const isManual = automation.runMode === 'manual'
  if (!isManual && view.sender.enrolled === 0) return 'Waiting for a sending phone'
  const { sent30d, waiting, cameBack30d } = automation.stats
  const lead = isManual ? 'Runs when you tap Run now' : 'On'
  if (sent30d === 0 && waiting === 0) return isManual ? lead : 'On · nothing sent yet'
  const parts = [lead]
  if (sent30d > 0) parts.push(`${sent30d} sent in 30 days`)
  if (cameBack30d > 0) parts.push(`${cameBack30d} ordered again`)
  if (waiting > 0) parts.push(`${waiting} waiting`)
  return parts.join(' · ')
}

export interface AutomationCardModel {
  recipe: RecipeInfo
  automation: Automation | null
  isOn: boolean
  statusLine: string
  blocker: Blocker | null
}

/** Cards that are on first, then the rest — runnable recipes before blocked ones. */
export function automationCards(view: AutomationsView): AutomationCardModel[] {
  const cards = view.recipes.map((recipe) => {
    const automation = view.automations.find((a) => a.recipe === recipe.id) ?? null
    const blocker = blockerFor(recipe.id, view)
    return {
      recipe,
      automation,
      isOn: automation?.status === 'on',
      statusLine: automation ? automationStatusLine(automation, view) : blocker?.text ?? 'Not set up',
      blocker,
    }
  })
  const rank = (card: AutomationCardModel) => (card.isOn ? 0 : card.automation ? 1 : card.blocker ? 3 : 2)
  return cards.map((card, index) => ({ card, index }))
    .sort((a, b) => rank(a.card) - rank(b.card) || a.index - b.index)
    .map(({ card }) => card)
}

export function deliveryEtaText(finishAt: string | null, waiting: number, now: number): string {
  if (waiting <= 0) return 'Nothing to send'
  const at = finishAt ? Date.parse(finishAt) : NaN
  if (!Number.isFinite(at)) return 'More than two weeks at your daily limit'
  if (at - now <= FEW_MINUTES_MS) return 'All out within a few minutes'
  const days = manilaDay(at) - manilaDay(now)
  if (days === 0) return `All out by ${clockText(at)} today`
  if (days === 1) return `All out by ${clockText(at)} tomorrow`
  return `All out by ${weekdayDateText(at)}`
}

export function etaAfterQueueing(outlook: DeliveryOutlook, rules: TextingRules, extra: number, now: number): string {
  const waiting = outlook.waiting + Math.max(0, extra)
  const finish = estimateDeliveryFinish({ waiting, sentToday: outlook.sentToday, now: new Date(now), rules })
  return deliveryEtaText(finish ? finish.toISOString() : null, waiting, now)
}

export function turnOnQuestion(queued: number): { title: string; body: string } {
  if (queued <= 0) return { title: 'No one qualifies right now', body: 'Guests get this text as they qualify.' }
  return { title: plural(queued, 'guest already qualifies', 'guests already qualify'), body: 'Text them now too?' }
}

export type SheetMode = 'turn_on' | 'run_now'

export interface SheetChoice {
  label: string
  sendBacklog: boolean
  tone: 'primary' | 'secondary'
}

/** The confirm dialog's buttons; the safe choice always leads. */
export function sheetChoices(input: {
  mode: SheetMode
  queued: number
  hasSender: boolean
  isOnline: boolean
  runMode: Automation['runMode']
}): { choices: SheetChoice[]; note: string | null } {
  const { mode, queued, hasSender, isOnline, runMode } = input
  const noPhone = 'Nothing sends until you connect a sending phone.'
  const offline = hasSender && !isOnline ? 'Your sending phone is offline right now. Texts wait until it’s back on.' : null
  if (mode === 'run_now') {
    if (queued <= 0) return { choices: [], note: null }
    if (!hasSender) return { choices: [], note: noPhone }
    return { choices: [{ label: `Text ${plural(queued, 'guest', 'guests')} now`, sendBacklog: true, tone: 'primary' }], note: offline }
  }
  if (queued <= 0) return { choices: [{ label: 'Turn it on', sendBacklog: false, tone: 'primary' }], note: hasSender ? null : noPhone }
  const later = runMode === 'manual' ? 'Turn on, text them later' : 'Turn on for new guests only'
  if (!hasSender) return { choices: [{ label: later, sendBacklog: false, tone: 'primary' }], note: noPhone }
  return {
    choices: [
      { label: later, sendBacklog: false, tone: 'primary' },
      { label: `Turn on and text ${queued} now`, sendBacklog: true, tone: 'secondary' },
    ],
    note: offline,
  }
}

export function sheetDoneText(mode: SheetMode, queued: number, eta: string): string {
  const waiting = `${plural(queued, 'text is', 'texts are')} waiting for your phone. ${eta}.`
  if (mode === 'run_now') return queued > 0 ? waiting : 'Nothing new to send. Everyone who qualifies already got it.'
  return queued > 0 ? `It’s on. ${waiting}` : 'It’s on. Guests get it as they qualify.'
}
