/**
 * Ready-made automations for the Studio's "Add" gallery (plan 2026-11-11, A1).
 * One tap fills a rule; the owner edits it before it is kept. Pure.
 *
 * Keywords match WHOLE words (`match.ts`), so short Filipino words are safe.
 */

import type { MessengerRule, RuleAction } from './rules'
import { newDraftRule } from './rule-labels'

export interface Recipe {
  id: string
  title: string
  /** What the customer gets, in a few words ("→ …" on the card). */
  answer: string
  /** A line a customer might type, for the preview. */
  sample: string
  keywords: readonly string[]
  action: RuleAction
}

export const RECIPES: readonly Recipe[] = [
  {
    id: 'prices',
    title: 'Prices',
    answer: 'Featured dishes',
    sample: 'magkano po?',
    keywords: ['magkano', 'how much', 'price', 'prices', 'presyo', 'hm po'],
    action: { kind: 'featured_items', itemIds: [], text: 'Here are our best sellers and their prices 👇' },
  },
  {
    id: 'open-today',
    title: 'Open today?',
    answer: 'Hours & location',
    sample: 'open po kayo today?',
    keywords: ['open', 'bukas', 'open today', 'what time', 'anong oras', 'hours', 'location', 'address', 'saan kayo', 'where are you'],
    action: { kind: 'hours_location' },
  },
  {
    id: 'payment',
    title: 'Payment methods',
    answer: 'Your own message',
    sample: 'gcash ok?',
    keywords: ['gcash', 'maya', 'paymaya', 'cod', 'cash on delivery', 'payment', 'bayad', 'pay'],
    action: {
      kind: 'text',
      text: 'We accept GCash, Maya and cash. You choose how to pay at checkout. 👍',
      buttons: [{ kind: 'menu', label: '🛒 Order now' }],
    },
  },
  {
    id: 'delivery',
    title: 'Delivery areas & fee',
    answer: 'Your own message',
    sample: 'nagdedeliver po ba kayo?',
    keywords: ['deliver', 'delivery', 'delivery fee', 'shipping', 'sf', 'rider', 'hatid', 'nagdedeliver'],
    action: {
      kind: 'text',
      text: 'Yes, we deliver! The delivery fee shows at checkout once you pin your location. 🛵',
      buttons: [{ kind: 'menu', label: '🛒 Order now' }],
    },
  },
  {
    id: 'promo',
    title: 'Promo of the day',
    answer: 'Featured dishes with your words',
    sample: 'may promo po?',
    keywords: ['promo', 'promos', 'sale', 'discount', 'deal', 'deals', 'freebie'],
    action: { kind: 'featured_items', itemIds: [], text: "Today's promo 🎉 Order before it runs out!" },
  },
  {
    id: 'person',
    title: 'Talk to a person',
    answer: 'Staff are told, the bot waits',
    sample: 'pwede po makausap tao?',
    keywords: ['tao', 'human', 'agent', 'person', 'staff', 'admin', 'kausap', 'real person'],
    action: { kind: 'talk_to_staff' },
  },
]

/** A recipe as a new, not-yet-saved rule. */
export function ruleFromRecipe(recipe: Recipe): MessengerRule {
  const draft = newDraftRule('keyword', recipe.action.kind)
  return {
    ...draft,
    name: recipe.title,
    trigger: { kind: 'keyword', keywords: [...recipe.keywords], match: 'contains' },
    action: JSON.parse(JSON.stringify(recipe.action)) as RuleAction,
  }
}
