/**
 * The recipe registry — the ONE place an automation recipe is defined.
 *
 * Screens, the planner, the AI tools and onboarding all read this list, and
 * `tests/unit/sms-automations/recipes.test.ts` runs over every entry, so a
 * recipe that forgets a default or ships a message that cannot render fails
 * there. Adding a recipe = add it to `RECIPE_IDS`, add an entry here, add its
 * candidate builder in `candidates.ts`.
 *
 * Messages are plain GSM-7 on purpose: one emoji or curly apostrophe re-encodes
 * the whole text as UCS-2 and the store pays for two or three texts instead of
 * one. Defaults borrow from what Toast/Square/Klaviyo ship (see the plan doc).
 */

import type { AutomationParams, RecipeId } from './types'

export type RecipeMoment = 'after_visit' | 'loyalty' | 'bring_back'
type ParamKey = keyof AutomationParams

export interface RecipeDefinition {
  id: RecipeId
  moment: RecipeMoment
  /**
   * Recipes in one family share dedupe: "regulars gone quiet" and "we miss
   * you" both react to the same absence, so a guest hears about it once.
   */
  family: string
  /** Lower goes first when two automations want the same guest. */
  priority: number
  title: string
  /** One line telling the owner why to turn it on. */
  pitch: string
  defaults: AutomationParams
  /** Inclusive [min, max] for every knob this recipe has. */
  limits: Partial<Record<ParamKey, readonly [number, number]>>
  /** At most one text from this family per guest every N days. */
  defaultReentryDays: number
  /**
   * In automatic mode only guests who STARTED to qualify this recently are
   * texted. Older qualifiers are the backlog the owner is asked about.
   */
  freshWindowHours: number
  /** Drop the text at send time if the guest ordered after it was queued. */
  exitOnOrder: boolean
  needsLoyalty: boolean
  needsReviewLink: boolean
  defaultMessage: string
  defaultMessageTl: string
}

export const RECIPES: readonly RecipeDefinition[] = [
  {
    id: 'loyalty_reward_expiring',
    moment: 'loyalty',
    family: 'reward_expiring',
    priority: 1,
    title: 'Reward expiring',
    pitch: 'Nobody likes losing a free treat. Remind them before it is gone.',
    defaults: { delayDays: 7 },
    limits: { delayDays: [1, 30] },
    defaultReentryDays: 7,
    freshWindowHours: 72,
    exitOnOrder: false,
    needsLoyalty: true,
    needsReviewLink: false,
    defaultMessage:
      'Hi {{firstName}}, your {{rewardName}} at {{storeName}} expires on {{rewardExpiryDate}}. Claim it before then! {{loyaltyLink}}',
    defaultMessageTl:
      'Hi {{firstName}}! Mag-e-expire na sa {{rewardExpiryDate}} ang {{rewardName}} mo sa {{storeName}}. I-claim na! {{loyaltyLink}}',
  },
  {
    id: 'loyalty_reward_waiting',
    moment: 'loyalty',
    family: 'reward_waiting',
    priority: 2,
    title: 'Reward waiting',
    pitch: 'Guests forget the reward they earned. A nudge brings them back to use it.',
    defaults: { delayDays: 3 },
    limits: { delayDays: [1, 30] },
    defaultReentryDays: 14,
    freshWindowHours: 72,
    exitOnOrder: false,
    needsLoyalty: true,
    needsReviewLink: false,
    defaultMessage:
      'Hi {{firstName}}, your {{rewardName}} at {{storeName}} is ready! Claim it on your next order. {{loyaltyLink}}',
    defaultMessageTl:
      'Hi {{firstName}}! Naghihintay na ang {{rewardName}} mo sa {{storeName}}. I-claim mo na sa next order mo! {{loyaltyLink}}',
  },
  {
    id: 'review_request',
    moment: 'after_visit',
    family: 'review',
    priority: 3,
    title: 'Review request',
    pitch: 'Happy regulars are your best reviewers. Ask while the meal is fresh.',
    defaults: { delayHours: 3, minOrderCount: 2 },
    limits: { delayHours: [1, 72], minOrderCount: [1, 10] },
    defaultReentryDays: 30,
    freshWindowHours: 24,
    exitOnOrder: false,
    needsLoyalty: false,
    needsReviewLink: true,
    defaultMessage:
      'Hi {{firstName}}, thank you for ordering at {{storeName}}! Would you leave us a quick review? {{reviewLink}}',
    defaultMessageTl:
      'Hi {{firstName}}! Salamat sa order mo sa {{storeName}}. Pa-review naman kami, malaking tulong! {{reviewLink}}',
  },
  {
    id: 'loyalty_almost_there',
    moment: 'loyalty',
    family: 'loyalty_progress',
    priority: 4,
    title: 'Almost there',
    pitch: 'A guest two stamps from a free drink is your easiest repeat order.',
    defaults: { remainingAtMost: 2, delayDays: 1 },
    limits: { remainingAtMost: [1, 10], delayDays: [0, 14] },
    defaultReentryDays: 7,
    freshWindowHours: 72,
    exitOnOrder: true,
    needsLoyalty: true,
    needsReviewLink: false,
    defaultMessage:
      'Hi {{firstName}}! Just {{progressLeft}} more and your {{rewardName}} at {{storeName}} is yours. {{loyaltyLink}}',
    defaultMessageTl:
      'Hi {{firstName}}! {{progressLeft}} na lang, makukuha mo na ang {{rewardName}} sa {{storeName}}. {{loyaltyLink}}',
  },
  {
    id: 'first_visit_followup',
    moment: 'after_visit',
    family: 'first_visit',
    priority: 5,
    title: 'Thank first-timers',
    pitch: 'The second order is the hardest. Invite new guests back while you are fresh in mind.',
    defaults: { delayDays: 5 },
    limits: { delayDays: [1, 30] },
    defaultReentryDays: 365,
    freshWindowHours: 72,
    exitOnOrder: true,
    needsLoyalty: false,
    needsReviewLink: false,
    defaultMessage:
      "Hi {{firstName}}, thanks for trying {{storeName}}! We'd love to have you back. Order here: {{menuLink}}",
    defaultMessageTl:
      'Hi {{firstName}}! Salamat sa pag-try sa {{storeName}}. Balik ka ha? Order dito: {{menuLink}}',
  },
  {
    id: 'regulars_gone_quiet',
    moment: 'bring_back',
    family: 'lapse',
    priority: 6,
    title: 'Regulars gone quiet',
    pitch: 'When a regular stops coming, a personal note works better than a discount.',
    defaults: { inactiveDays: 21, minOrderCount: 3 },
    limits: { inactiveDays: [7, 180], minOrderCount: [2, 20] },
    defaultReentryDays: 60,
    freshWindowHours: 96,
    exitOnOrder: true,
    needsLoyalty: false,
    needsReviewLink: false,
    defaultMessage:
      "Hi {{firstName}}, we haven't seen you in a while! Your {{favoriteItem}} is waiting at {{storeName}}. {{menuLink}}",
    defaultMessageTl:
      'Hi {{firstName}}, miss ka na namin! Naghihintay ang {{favoriteItem}} mo sa {{storeName}}. {{menuLink}}',
  },
  {
    id: 'win_back',
    moment: 'bring_back',
    family: 'lapse',
    priority: 7,
    title: 'We miss you',
    pitch: 'Guests drift away quietly. A friendly hello after a month brings many back.',
    defaults: { inactiveDays: 30 },
    limits: { inactiveDays: [7, 365] },
    defaultReentryDays: 60,
    freshWindowHours: 96,
    exitOnOrder: true,
    needsLoyalty: false,
    needsReviewLink: false,
    defaultMessage:
      "Hi {{firstName}}, we miss you at {{storeName}}! It's been {{daysSinceLastOrder}} days. Come back soon: {{menuLink}}",
    defaultMessageTl:
      'Hi {{firstName}}, miss ka na namin sa {{storeName}}! {{daysSinceLastOrder}} days na. Order ulit dito: {{menuLink}}',
  },
]

const BY_ID = new Map<RecipeId, RecipeDefinition>(RECIPES.map((recipe) => [recipe.id, recipe]))

export function getRecipe(id: RecipeId): RecipeDefinition {
  const recipe = BY_ID.get(id)
  if (!recipe) throw new Error(`Unknown SMS automation recipe: ${id}`)
  return recipe
}

export function isRecipeId(value: unknown): value is RecipeId {
  return typeof value === 'string' && BY_ID.has(value as RecipeId)
}

/** The knobs this recipe actually uses, with the owner's values over the defaults. */
export function resolveParams(id: RecipeId, params: AutomationParams): Required<AutomationParams> {
  const recipe = getRecipe(id)
  const merged = { ...recipe.defaults }
  for (const key of Object.keys(recipe.defaults) as ParamKey[]) {
    const value = params[key]
    if (typeof value === 'number' && Number.isFinite(value)) merged[key] = value
  }
  return merged as Required<AutomationParams>
}

/** Keeps only this recipe's knobs, rounded and held inside its limits. */
export function clampParams(id: RecipeId, params: AutomationParams): AutomationParams {
  const recipe = getRecipe(id)
  const resolved = resolveParams(id, params)
  const clamped: AutomationParams = {}
  for (const key of Object.keys(recipe.defaults) as ParamKey[]) {
    const [min, max] = recipe.limits[key] ?? [0, Number.MAX_SAFE_INTEGER]
    clamped[key] = Math.min(max, Math.max(min, Math.round(resolved[key])))
  }
  return clamped
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** The automation as one plain sentence, for cards, previews and the AI. */
export function describeAutomation(id: RecipeId, params: AutomationParams): string {
  const p = resolveParams(id, params)
  switch (id) {
    case 'review_request':
      return `${plural(p.delayHours, 'hour', 'hours')} after an order, ask ${p.minOrderCount >= 2 ? 'repeat guests ' : ''}for a review`
    case 'first_visit_followup':
      return `${plural(p.delayDays, 'day', 'days')} after a guest’s first order, invite them back`
    case 'loyalty_almost_there':
      return `Text guests ${plural(p.remainingAtMost, 'stamp', 'stamps')} away from a reward`
    case 'loyalty_reward_waiting':
      return `Remind guests about a reward unclaimed for ${plural(p.delayDays, 'day', 'days')}`
    case 'loyalty_reward_expiring':
      return `Remind guests ${plural(p.delayDays, 'day', 'days')} before a reward expires`
    case 'regulars_gone_quiet':
      return `Text regulars (${p.minOrderCount}+ orders) quiet for ${plural(p.inactiveDays, 'day', 'days')}`
    case 'win_back':
      return `Text guests who haven’t ordered in ${plural(p.inactiveDays, 'day', 'days')}`
  }
}
