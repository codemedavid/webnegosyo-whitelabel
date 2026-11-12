/**
 * Messenger automation rules: a trigger, an action and its wording.
 *
 * One zod schema validates a rule on save (server action) AND again on read in
 * the webhook, so a hand-edited row can never reach Meta. Stored as two jsonb
 * columns (`trigger`, `action`) on `messenger_rules`.
 */

import { z } from 'zod'
import { MESSENGER_LIMITS } from './limits'
import { matchesAnyKeyword } from './match'

export const MAX_RULES = 50
export const MAX_ICE_BREAKER_RULES = MESSENGER_LIMITS.iceBreakers
/** Meta allows 20; more than 5 makes the menu hard to use on a phone. */
export const MAX_MENU_BUTTON_RULES = 5
export const MAX_KEYWORDS = 30
export const MAX_KEYWORD_LENGTH = 40
export const MAX_FEATURED_ITEMS = 9
export const MAX_REPLY_TEXT = 600

const keyword = z.string().trim().min(1).max(MAX_KEYWORD_LENGTH)
const optionalText = (max: number) => z.string().trim().max(max).optional()
const buttonLabel = z.string().trim().min(1).max(MESSENGER_LIMITS.buttonTitle)
const rowId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)

/**
 * "Only when" on a typed-message trigger (plan A5): absent = always, else only
 * while the store is open / closed by its own hours. Starter questions and
 * menu buttons live in Meta's profile and always answer.
 */
export const RULE_WHEN = ['open', 'closed'] as const
export type RuleWhen = (typeof RULE_WHEN)[number]
const when = z.enum(RULE_WHEN).optional()

export const triggerSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('keyword'),
    keywords: z.array(keyword).min(1).max(MAX_KEYWORDS),
    match: z.enum(['contains', 'exact']),
    when,
  }).strict(),
  z.object({ kind: z.literal('get_started'), when }).strict(),
  z.object({ kind: z.literal('ice_breaker'), question: z.string().trim().min(1).max(MESSENGER_LIMITS.iceBreakerQuestion) }).strict(),
  z.object({ kind: z.literal('menu_button'), label: z.string().trim().min(1).max(MESSENGER_LIMITS.persistentMenuTitle) }).strict(),
  z.object({ kind: z.literal('fallback'), when }).strict(),
])

/** A button under the owner's own text. Links must be https. */
export const textButtonSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('link'),
    label: buttonLabel,
    url: z.string().trim().max(500).url().refine((url) => url.startsWith('https://'), 'Links must start with https://'),
  }).strict(),
  z.object({ kind: z.literal('menu'), label: buttonLabel }).strict(),
  z.object({ kind: z.literal('categories'), label: buttonLabel }).strict(),
  z.object({ kind: z.literal('staff'), label: buttonLabel }).strict(),
])

export const actionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('menu_card'),
    title: optionalText(MESSENGER_LIMITS.cardTitle),
    subtitle: optionalText(MESSENGER_LIMITS.cardSubtitle),
    buttonLabel: optionalText(MESSENGER_LIMITS.buttonTitle),
    showCategoriesButton: z.boolean().optional(),
  }).strict(),
  z.object({ kind: z.literal('categories'), text: optionalText(MAX_REPLY_TEXT) }).strict(),
  z.object({ kind: z.literal('category_items'), categoryId: rowId, text: optionalText(MAX_REPLY_TEXT) }).strict(),
  z.object({
    kind: z.literal('featured_items'),
    itemIds: z.array(rowId).max(MAX_FEATURED_ITEMS),
    text: optionalText(MAX_REPLY_TEXT),
  }).strict(),
  z.object({
    kind: z.literal('text'),
    text: z.string().trim().min(1).max(MAX_REPLY_TEXT),
    buttons: z.array(textButtonSchema).max(MESSENGER_LIMITS.cardButtons),
  }).strict(),
  z.object({ kind: z.literal('hours_location'), text: optionalText(MAX_REPLY_TEXT) }).strict(),
  z.object({ kind: z.literal('talk_to_staff'), text: optionalText(MAX_REPLY_TEXT) }).strict(),
  z.object({ kind: z.literal('order_status'), text: optionalText(MAX_REPLY_TEXT) }).strict(),
  z.object({ kind: z.literal('cart') }).strict(),
])

export type RuleTrigger = z.infer<typeof triggerSchema>
export type RuleAction = z.infer<typeof actionSchema>
export type TextButton = z.infer<typeof textButtonSchema>
export type TriggerKind = RuleTrigger['kind']
export type ActionKind = RuleAction['kind']

export const TRIGGER_KINDS = ['keyword', 'get_started', 'ice_breaker', 'menu_button', 'fallback'] as const satisfies readonly TriggerKind[]
export const ACTION_KINDS = [
  'menu_card', 'categories', 'category_items', 'featured_items', 'text', 'hours_location', 'talk_to_staff', 'order_status', 'cart',
] as const satisfies readonly ActionKind[]

export const ruleSchema = z.object({
  id: rowId,
  name: z.string().trim().min(1).max(60),
  trigger: triggerSchema,
  action: actionSchema,
  isEnabled: z.boolean(),
}).strict()

export type MessengerRule = z.infer<typeof ruleSchema>

/** Today's hardcoded webhook keywords (before 2026-11-10) plus Filipino ways to ask. */
export const DEFAULT_ORDER_STATUS_KEYWORDS = [
  'where is my order', 'order status', 'track order', 'my order', 'tracking', 'where is order', 'order update',
  'delivery status', 'when will my order', 'order location', 'check order',
  // Not a bare "order ko": "pa order ko ng 2" is a new order, not a status question.
  'nasaan order ko', 'nasaan na order ko', 'nasan na order ko', 'asan na order ko', 'asan order ko', 'status ng order',
]

export const DEFAULT_MENU_KEYWORDS = [
  'menu', 'menus', 'product', 'products', 'i want to order', 'place order', 'new order', 'item', 'items', 'food',
  'catalog', 'price', 'prices', 'what do you have', 'what do you sell', 'available', 'offer', 'offers', 'offerings',
  'magkano', 'ano meron', 'ano ang meron', 'pa order', 'paorder', 'mag order', 'order po',
]

/** Added 2026-11 with the chat cart. Not "order": that word starts a new order. */
export const DEFAULT_CART_KEYWORDS = ['cart', 'my cart', 'view cart', 'basket', 'checkout', 'check out ko']

/**
 * What a store runs before its owner saves any rule. Order status comes first,
 * as before: "where is my order" must never get a menu card.
 */
export const DEFAULT_RULES: readonly MessengerRule[] = Object.freeze([
  {
    id: 'default-order-status',
    name: 'Where is my order',
    trigger: { kind: 'keyword', keywords: DEFAULT_ORDER_STATUS_KEYWORDS, match: 'contains' },
    action: { kind: 'order_status' },
    isEnabled: true,
  },
  {
    id: 'default-cart',
    name: 'My cart',
    trigger: { kind: 'keyword', keywords: DEFAULT_CART_KEYWORDS, match: 'contains' },
    action: { kind: 'cart' },
    isEnabled: true,
  },
  {
    id: 'default-menu',
    name: 'Menu',
    trigger: { kind: 'keyword', keywords: DEFAULT_MENU_KEYWORDS, match: 'contains' },
    action: { kind: 'menu_card' },
    isEnabled: true,
  },
  {
    id: 'default-get-started',
    name: 'Get Started',
    trigger: { kind: 'get_started' },
    action: { kind: 'menu_card' },
    isEnabled: true,
  },
])

/**
 * Problems with a whole rule set that a single-rule schema can't see.
 * Empty array = fine.
 */
export function ruleSetProblems(rules: readonly MessengerRule[]): string[] {
  const problems: string[] = []
  const count = (kind: TriggerKind) => rules.filter((rule) => rule.trigger.kind === kind).length
  // Get Started and the fallback: one per "Only when" choice (always / open / closed).
  const crowded = (kind: TriggerKind) => {
    const seen = new Map<string, number>()
    for (const rule of rules) {
      if (rule.trigger.kind !== kind) continue
      const key = triggerWhen(rule.trigger) ?? 'always'
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    return [...seen.values()].some((n) => n > 1)
  }
  if (rules.length > MAX_RULES) problems.push(`At most ${MAX_RULES} automations.`)
  if (crowded('get_started')) problems.push('Only one automation can answer Get Started (one per "Only when" choice).')
  if (crowded('fallback')) problems.push('Only one automation can be the "didn\'t understand" reply (one per "Only when" choice).')
  if (count('ice_breaker') > MAX_ICE_BREAKER_RULES) problems.push(`Messenger shows at most ${MAX_ICE_BREAKER_RULES} starter questions.`)
  if (count('menu_button') > MAX_MENU_BUTTON_RULES) problems.push(`At most ${MAX_MENU_BUTTON_RULES} menu buttons.`)
  if (new Set(rules.map((rule) => rule.id)).size !== rules.length) problems.push('Two automations share an id.')
  return problems
}

/** Parse stored rows, dropping (not throwing on) any that no longer validate. */
export function parseStoredRules(rows: readonly unknown[]): MessengerRule[] {
  const rules: MessengerRule[] = []
  for (const row of rows) {
    const parsed = ruleSchema.safeParse(row)
    if (parsed.success) rules.push(parsed.data)
  }
  return rules
}

/** A trigger's "Only when", or null for always. */
export function triggerWhen(trigger: RuleTrigger): RuleWhen | null {
  return 'when' in trigger && trigger.when ? trigger.when : null
}

/** Does this rule answer right now? `isOpen` = the store's hours say open. */
export function appliesNow(rule: MessengerRule, isOpen: boolean): boolean {
  const only = triggerWhen(rule.trigger)
  return only === null || (only === 'open') === isOpen
}

/**
 * The enabled Get Started / fallback rule for right now: one limited to the
 * current state ("only when closed" at night) beats an always-on one.
 */
export function pickOnceRule(
  rules: readonly MessengerRule[],
  kind: 'get_started' | 'fallback',
  isOpen = true,
): MessengerRule | null {
  const candidates = rules.filter((rule) => rule.isEnabled && rule.trigger.kind === kind && appliesNow(rule, isOpen))
  return candidates.find((rule) => triggerWhen(rule.trigger) !== null) ?? candidates[0] ?? null
}

/** First enabled keyword rule the text matches right now, else the fallback, else null. */
export function pickRuleForText(rules: readonly MessengerRule[], text: string, isOpen = true): MessengerRule | null {
  for (const rule of rules) {
    if (!rule.isEnabled || rule.trigger.kind !== 'keyword' || !appliesNow(rule, isOpen)) continue
    if (matchesAnyKeyword(text, rule.trigger.keywords, rule.trigger.match)) return rule
  }
  return pickOnceRule(rules, 'fallback', isOpen)
}

export function findEnabledRule(
  rules: readonly MessengerRule[],
  predicate: (rule: MessengerRule) => boolean,
): MessengerRule | null {
  return rules.find((rule) => rule.isEnabled && predicate(rule)) ?? null
}
