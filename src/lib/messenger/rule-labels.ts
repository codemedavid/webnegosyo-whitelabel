/**
 * Words the automations editor shows for each trigger and action, and the
 * starting point of a new rule. Pure, shared by the editor and its tests.
 */

import type { ActionKind, MessengerRule, RuleAction, RuleTrigger, TriggerKind } from './rules'

export const TRIGGER_LABELS: Record<TriggerKind, { title: string; help: string }> = {
  keyword: { title: 'A customer types…', help: 'Answers when a message contains one of these words.' },
  get_started: { title: 'Get Started button', help: 'The first tap of a new customer on your Page’s chat.' },
  ice_breaker: { title: 'Starter question', help: 'A question new customers can tap instead of typing (up to 4).' },
  menu_button: { title: 'Chat menu button', help: 'A button in the menu beside the chat box (up to 5).' },
  fallback: { title: 'Nothing else matched', help: 'The reply when no other automation fits. It answers every unmatched message, so keep it short and give buttons.' },
}

export const ACTION_LABELS: Record<ActionKind, { title: string; help: string }> = {
  menu_card: { title: 'Menu card', help: 'One card with your logo and a button to your online menu.' },
  categories: { title: 'Pick a category', help: 'Buttons for each category; a tap shows its dishes.' },
  category_items: { title: 'Dishes in a category', help: 'A swipeable row of one category’s dishes with photos and prices.' },
  featured_items: { title: 'Featured dishes', help: 'A swipeable row of dishes you choose (or your featured ones).' },
  text: { title: 'Your own message', help: 'Your words, with up to 3 buttons.' },
  hours_location: { title: 'Hours & location', help: 'Today’s hours, your address and a directions button.' },
  talk_to_staff: { title: 'Talk to staff', help: 'Tells the customer someone will reply, and pauses the bot for them.' },
  order_status: { title: 'Order status', help: 'Points the customer to their tracking link.' },
}

export const TRIGGER_KIND_ORDER: readonly TriggerKind[] = ['keyword', 'get_started', 'ice_breaker', 'menu_button', 'fallback']
export const ACTION_KIND_ORDER: readonly ActionKind[] = [
  'menu_card', 'categories', 'category_items', 'featured_items', 'text', 'hours_location', 'talk_to_staff', 'order_status',
]

export const TAKEOVER_OPTIONS: ReadonlyArray<{ minutes: number; label: string }> = [
  { minutes: 30, label: '30 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 240, label: '4 hours' },
  { minutes: 1440, label: '24 hours' },
  { minutes: 0, label: 'Never pause' },
]

export function describeTrigger(trigger: RuleTrigger): string {
  switch (trigger.kind) {
    case 'keyword': {
      const shown = trigger.keywords.slice(0, 3).map((word) => `“${word}”`).join(', ')
      const more = trigger.keywords.length > 3 ? ` +${trigger.keywords.length - 3} more` : ''
      return `${trigger.match === 'exact' ? 'Exactly ' : ''}${shown}${more}`
    }
    case 'ice_breaker':
      return `Starter question: “${trigger.question}”`
    case 'menu_button':
      return `Chat menu: “${trigger.label}”`
    default:
      return TRIGGER_LABELS[trigger.kind].title
  }
}

export function defaultTrigger(kind: TriggerKind): RuleTrigger {
  switch (kind) {
    case 'keyword':
      return { kind, keywords: [], match: 'contains' }
    case 'ice_breaker':
      return { kind, question: '' }
    case 'menu_button':
      return { kind, label: '' }
    default:
      return { kind }
  }
}

export function defaultAction(kind: ActionKind, firstCategoryId: string | null): RuleAction {
  switch (kind) {
    case 'category_items':
      return { kind, categoryId: firstCategoryId ?? '' }
    case 'featured_items':
      return { kind, itemIds: [] }
    case 'text':
      return { kind, text: '', buttons: [] }
    default:
      return { kind } as RuleAction
  }
}

let draftCounter = 0
/** A new, not-yet-saved rule; the server gives it a real id on save. */
export function newDraftRule(trigger: TriggerKind = 'keyword', action: ActionKind = 'menu_card', firstCategoryId: string | null = null): MessengerRule {
  draftCounter += 1
  return {
    id: `draft-${Date.now().toString(36)}-${draftCounter}`,
    name: ACTION_LABELS[action].title,
    trigger: defaultTrigger(trigger),
    action: defaultAction(action, firstCategoryId),
    isEnabled: true,
  }
}

/** Immutable reorder: move the rule at `from` one step up (-1) or down (+1). */
export function moveRule<T>(rules: readonly T[], from: number, step: -1 | 1): T[] {
  const to = from + step
  if (from < 0 || from >= rules.length || to < 0 || to >= rules.length) return [...rules]
  const next = [...rules]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
