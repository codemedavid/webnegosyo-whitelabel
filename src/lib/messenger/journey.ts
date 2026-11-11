/**
 * The Studio's Journey tab: the customer's path through the chat, one step
 * per moment, each with a one-line summary of what the bot does there. Pure.
 */

import type { OrderUpdatesConfig } from './order-view'
import { statusLabel } from './order-view'
import { ACTION_LABELS } from './rule-labels'
import type { MessengerRule } from './rules'
import type { PreviewMoment } from './studio-scenarios'

export type JourneyStepId = PreviewMoment | 'fallback'

export interface JourneyStep {
  id: JourneyStepId
  title: string
  summary: string
  /** Steps that are off say so (and the card dims). */
  isOff?: boolean
}

export interface JourneyInput {
  rules: readonly MessengerRule[]
  orderUpdates: OrderUpdatesConfig
  takeoverMinutes: number
  isPlatformOrders: boolean
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function takeoverText(minutes: number): string {
  if (minutes <= 0) return 'When you reply in Page Inbox the bot keeps answering'
  if (minutes < 60) return `When you reply in Page Inbox the bot waits ${minutes} minutes`
  const hours = minutes / 60
  return `When you reply in Page Inbox the bot waits ${hours === 1 ? '1 hour' : `${hours} hours`}`
}

export function journeySteps(input: JourneyInput): JourneyStep[] {
  const enabled = input.rules.filter((rule) => rule.isEnabled)
  const getStarted = enabled.find((rule) => rule.trigger.kind === 'get_started')
  const starters = enabled.filter((rule) => rule.trigger.kind === 'ice_breaker').length
  const menuButtons = enabled.filter((rule) => rule.trigger.kind === 'menu_button').length
  const fallback = enabled.find((rule) => rule.trigger.kind === 'fallback')

  const hello = [
    `Get Started sends ${getStarted ? ACTION_LABELS[getStarted.action.kind].title.toLowerCase() : 'your menu card'}`,
    starters > 0 ? plural(starters, 'starter question') : null,
    menuButtons > 0 ? plural(menuButtons, 'chat menu button') : null,
  ].filter(Boolean).join(' · ')

  const updates = input.orderUpdates
  const isAfterOff = !input.isPlatformOrders || !updates.enabled || updates.statuses.length === 0
  const after = !input.isPlatformOrders
    ? 'Customers get their tracking link (your orders are on a separate system)'
    : isAfterOff
      ? 'Off. Customers check their tracking link themselves'
      : `Messages when it’s ${updates.statuses.map((status) => statusLabel(status, null).toLowerCase()).join(', ')}`

  return [
    { id: 'hello', title: 'First hello', summary: hello },
    { id: 'browsing', title: 'Browsing', summary: 'Categories, then dishes with photos, prices and Add to cart' },
    { id: 'cart', title: 'Cart', summary: '“Added” message, cart with − / +, Checkout opens your web cart' },
    { id: 'after', title: 'After ordering', summary: after, isOff: isAfterOff },
    { id: 'handover', title: 'Handover to staff', summary: takeoverText(input.takeoverMinutes) },
    {
      id: 'fallback',
      title: 'When the bot doesn’t understand',
      summary: fallback ? `Sends ${ACTION_LABELS[fallback.action.kind].title.toLowerCase()}` : 'Off. A message that fits nothing gets no answer',
      isOff: !fallback,
    },
  ]
}
