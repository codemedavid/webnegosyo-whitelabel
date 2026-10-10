/**
 * "Start here": the owner's first weeks as one path, one current step at a
 * time (Duolingo's path, Shopify's setup guide).
 *
 * Steps tick THEMSELVES from the store's own data (first order, app signed
 * in, a combo sold, a stamp given) so progress follows the owner across
 * devices and never feels like homework. Only what data cannot prove ("I put
 * my link on Facebook") takes a tap. The goal steps follow what the owner
 * said they want. A signal we could not read is `null`: that step can be
 * ticked by hand, and is never assumed done.
 *
 * Pure; the reads live in `start-path-data.ts`.
 */

import { orderGoals, shareHint, type ChannelId, type GoalId } from './goals'

export type PathStepId =
  | 'open' | 'combos' | 'share'
  | 'app' | 'first_order' | 'ten_orders'
  | 'combo_sale' | 'first_stamp' | 'texts_on' | 'photos' | 'pos_sale'
  | 'learn'

/** Steps only a tap can finish. */
export const MANUAL_STEPS: ReadonlySet<PathStepId> = new Set(['share'])
/** Steps a tap may finish when their data could not be read. */
const TICKABLE_WHEN_UNKNOWN: ReadonlySet<PathStepId> = new Set(['app', 'first_order', 'ten_orders', 'combo_sale', 'first_stamp', 'texts_on', 'photos', 'pos_sale'])

export const PATH_STEP_IDS: readonly PathStepId[] = [
  'open', 'combos', 'share', 'app', 'first_order', 'ten_orders',
  'combo_sale', 'first_stamp', 'texts_on', 'photos', 'pos_sale', 'learn',
]

export function isPathStepId(value: unknown): value is PathStepId {
  return typeof value === 'string' && (PATH_STEP_IDS as readonly string[]).includes(value)
}

export function canTickByHand(step: PathStepId, signals: PathSignals): boolean {
  if (MANUAL_STEPS.has(step)) return true
  return TICKABLE_WHEN_UNKNOWN.has(step) && signalOf(step, signals) === null
}

export interface PathSignals {
  isLive: boolean
  /** null = this store has no launch combos (nothing to review). */
  launchCombosWaiting: number | null
  hasAppLogin: boolean | null
  orderCount: number | null
  comboOrderCount: number | null
  stampsGiven: number | null
  activeTexts: number | null
  /** Best sellers with a photo, out of how many best sellers. */
  bestSellerPhotos: { withPhoto: number; total: number } | null
  posOrderCount: number | null
  lessonsWatched: number
  /** Steps the owner ticked by hand. */
  ticks: ReadonlySet<string>
}

export interface PathContext {
  goals: readonly GoalId[]
  channels: readonly ChannelId[]
  /** e.g. "/kape/admin". */
  adminPath: string
  shareUrl: string | null
  /** The platform host ('' when already on it): /download is never served on a store's own domain. */
  platformOrigin: string
}

export type PathStepState = 'done' | 'current' | 'upcoming'

export interface PathStep {
  id: PathStepId
  title: string
  detail: string
  state: PathStepState
  /** Where to do it; null when the step happens elsewhere (the app, the counter). */
  action: { label: string; href: string } | null
  /** University lessons that show how, most useful first. */
  lessonSlugs: string[]
  /** The goal this step serves, quoted back to the owner. */
  goal: GoalId | null
  canTick: boolean
}

export interface PathUnit {
  id: 'today' | 'week1' | 'week2' | 'week3'
  title: string
  subtitle: string
  steps: PathStep[]
}

export interface StartPath {
  units: PathUnit[]
  done: number
  total: number
  currentStepId: PathStepId | null
  isComplete: boolean
}

export const LEARN_TARGET = 3
const TEN_ORDERS = 10
const PHOTO_TARGET = 3

/** true / false from data; null = unknown. */
function signalOf(step: PathStepId, s: PathSignals): boolean | null {
  switch (step) {
    case 'open': return s.isLive
    case 'combos': return s.launchCombosWaiting === null ? true : s.launchCombosWaiting === 0
    case 'share': return null
    case 'app': return s.hasAppLogin
    case 'first_order': return s.orderCount === null ? null : s.orderCount >= 1
    case 'ten_orders': return s.orderCount === null ? null : s.orderCount >= TEN_ORDERS
    case 'combo_sale': return s.comboOrderCount === null ? null : s.comboOrderCount >= 1
    case 'first_stamp': return s.stampsGiven === null ? null : s.stampsGiven >= 1
    case 'texts_on': return s.activeTexts === null ? null : s.activeTexts >= 1
    case 'photos': {
      const photos = s.bestSellerPhotos
      if (!photos) return null
      return photos.withPhoto >= Math.max(1, Math.min(PHOTO_TARGET, photos.total))
    }
    case 'pos_sale': return s.posOrderCount === null ? null : s.posOrderCount >= 1
    case 'learn': return s.lessonsWatched >= LEARN_TARGET
  }
}

function isDone(step: PathStepId, s: PathSignals): boolean {
  return signalOf(step, s) === true || (canTickByHand(step, s) && s.ticks.has(step))
}

type Draft = Omit<PathStep, 'state' | 'canTick'>

function todaySteps(ctx: PathContext, s: PathSignals): Draft[] {
  const share: Draft = {
    id: 'share',
    title: 'Put your link where customers already are',
    detail: shareHint(ctx.channels),
    action: null,
    lessonSlugs: [],
    goal: null,
  }
  return [
    {
      id: 'open',
      title: s.isLive ? 'Your store is open' : 'Open your store',
      detail: s.isLive ? (ctx.shareUrl ?? 'Customers can order now') : 'Clear the last few things below, then open it for orders',
      action: s.isLive ? null : { label: 'Open it', href: `${ctx.adminPath}/start#launch` },
      lessonSlugs: ['welcome-to-smartmenu'],
      goal: null,
    },
    ...(s.launchCombosWaiting === null ? [] : [{
      id: 'combos' as const,
      title: 'Review your combos',
      detail: 'We drafted combos from your menu. Keep the ones you like; they go on your menu only then.',
      action: { label: 'Review', href: `${ctx.adminPath}/boost-sales#boost-ai-log` },
      lessonSlugs: [],
      goal: 'bigger_orders' as const,
    }]),
    share,
  ]
}

function weekOneSteps(ctx: PathContext): Draft[] {
  return [
    {
      id: 'app',
      title: 'Get the app and hear new orders ring',
      detail: 'Sign in on your phone with the same email. Ticks by itself once you do.',
      action: { label: 'Get the app', href: `${ctx.platformOrigin}/download` },
      lessonSlugs: ['downloading-the-app', 'getting-started-sa-smartmenu-app'],
      goal: null,
    },
    {
      id: 'first_order',
      title: 'Your first order',
      detail: 'Order from your own link to practice, then accept it. Ticks by itself.',
      action: { label: 'See orders', href: `${ctx.adminPath}/orders` },
      lessonSlugs: ['first-order-sa-smartmenu'],
      goal: null,
    },
    {
      id: 'ten_orders',
      title: 'Your first 10 orders',
      detail: 'Keep sharing your link. Every order is counted here.',
      action: null,
      lessonSlugs: [],
      goal: null,
    },
  ]
}

const GOAL_STEPS: Record<GoalId, (ctx: PathContext) => Draft[]> = {
  ordering: (ctx) => [{
    id: 'photos',
    title: 'Add photos to your best sellers',
    detail: 'Dishes with a photo get picked more. Start with your top 3.',
    action: { label: 'Open menu', href: `${ctx.adminPath}/menu` },
    lessonSlugs: ['adding-images-ng-items-managing-your-products'],
    goal: 'ordering',
  }],
  bigger_orders: (ctx) => [{
    id: 'combo_sale',
    title: 'Sell your first combo',
    detail: 'See it in Boost Sales, with how your upgrades and cart add-on are doing.',
    action: { label: 'Boost Sales', href: `${ctx.adminPath}/boost-sales` },
    lessonSlugs: [],
    goal: 'bigger_orders',
  }],
  regulars: (ctx) => [
    {
      id: 'first_stamp',
      title: 'Give your first stamp',
      detail: 'Customers earn one when they order with their phone number.',
      action: { label: 'Loyalty', href: `${ctx.adminPath}/loyalty` },
      lessonSlugs: [],
      goal: 'regulars',
    },
    {
      id: 'texts_on',
      title: 'Turn on a text message',
      detail: 'In the SmartMenu app on Android: Reports → Bring them back.',
      action: null,
      lessonSlugs: [],
      goal: 'regulars',
    },
  ],
  faster_counter: () => [{
    id: 'pos_sale',
    title: 'Ring up a walk-in on the register',
    detail: 'In the SmartMenu app. Walk-ins and online orders land in one list.',
    action: null,
    lessonSlugs: ['introduction-sa-pos-walk-in-orders', 'connecting-sa-printer'],
    goal: 'faster_counter',
  }],
}

function goalSteps(ctx: PathContext): Draft[] {
  const goals = orderGoals(ctx.goals)
  return (goals.length > 0 ? goals : (['ordering'] as GoalId[])).flatMap((goal) => GOAL_STEPS[goal](ctx))
}

function learnStep(ctx: PathContext): Draft {
  return {
    id: 'learn',
    title: `Watch ${LEARN_TARGET} must-watch lessons`,
    detail: 'Short videos picked for your goals. Watched ones are counted on every device.',
    action: { label: 'Learn', href: `${ctx.adminPath}/learn` },
    lessonSlugs: [],
    goal: null,
  }
}

export function buildStartPath(ctx: PathContext, signals: PathSignals): StartPath {
  const drafts: Array<{ unit: PathUnit['id']; step: Draft }> = [
    ...todaySteps(ctx, signals).map((step) => ({ unit: 'today' as const, step })),
    ...weekOneSteps(ctx).map((step) => ({ unit: 'week1' as const, step })),
    ...goalSteps(ctx).map((step) => ({ unit: 'week2' as const, step })),
    { unit: 'week3' as const, step: learnStep(ctx) },
  ]
  const doneIds = new Set(drafts.filter(({ step }) => isDone(step.id, signals)).map(({ step }) => step.id))
  const current = drafts.find(({ step }) => !doneIds.has(step.id))?.step.id ?? null
  const withState = drafts.map(({ unit, step }) => ({
    unit,
    step: {
      ...step,
      state: doneIds.has(step.id) ? 'done' as const : step.id === current ? 'current' as const : 'upcoming' as const,
      canTick: !doneIds.has(step.id) && canTickByHand(step.id, signals),
    },
  }))

  const UNIT_COPY: Record<PathUnit['id'], { title: string; subtitle: string }> = {
    today: { title: 'Today', subtitle: 'Open and share' },
    week1: { title: 'This week', subtitle: 'Your first orders' },
    week2: { title: 'Week 2', subtitle: 'Your goals' },
    week3: { title: 'Week 3', subtitle: 'Learn the rest' },
  }
  const units = (Object.keys(UNIT_COPY) as PathUnit['id'][])
    .map((id) => ({ id, ...UNIT_COPY[id], steps: withState.filter((row) => row.unit === id).map((row) => row.step) }))
    .filter((unit) => unit.steps.length > 0)

  return {
    units,
    done: doneIds.size,
    total: drafts.length,
    currentStepId: current,
    isComplete: current === null,
  }
}
