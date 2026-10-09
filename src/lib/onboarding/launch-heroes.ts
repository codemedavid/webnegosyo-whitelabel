/**
 * Store-filled launch heroes: Hero Builder (v5) designs written from what the
 * owner told us, so a new store opens on a hero that is its own.
 *
 * The gallery templates are built around stock photos and sample claims
 * ("Rated 4.9", "Est. 2012", "30–45 min"); retitling one would leave those on
 * a real store. These four reuse the templates' layouts (ways to order, how it
 * works, features strip, poster) but every word comes from the store: its
 * name, tagline, real order types, payment methods, hours and best sellers.
 * No photos, no invented numbers.
 *
 * Built with the Hero Builder kit, so the owner can open and edit the result
 * in Hero Builder. Colors are theme refs that follow the store's branding,
 * except the button color, which is pinned to the storefront's button so its
 * label (`--brand-button-primary-text`) stays readable.
 *
 * Pure: no I/O.
 */

import {
  DISPLAY,
  DISPLAY_MOBILE,
  LEAD,
  LEAD_MOBILE,
  MENU_ANCHOR,
  badge,
  box,
  button,
  buttons,
  design,
  heading,
  iconList,
  listItem,
  section,
  text,
  widget,
  type ColumnSpec,
} from '@/lib/hero-builder/section-presets'
import type { HeroDesignV5, NodeStyle, Section } from '@/lib/hero-builder/types'
import type { OnboardingOrderType } from './answers'

export const LAUNCH_HEROES = ['ways', 'steps', 'favorites', 'poster'] as const
export type LaunchHero = (typeof LAUNCH_HEROES)[number]
export type LaunchHeroChoice = LaunchHero | 'none'
export const LAUNCH_HERO_CHOICES: readonly LaunchHeroChoice[] = [...LAUNCH_HEROES, 'none']

export const LAUNCH_HERO_LABELS: Record<LaunchHeroChoice, string> = {
  ways: 'Ways to order',
  steps: 'How it works',
  favorites: 'Best sellers',
  poster: 'Poster',
  none: 'No hero',
}

export function isLaunchHeroChoice(value: unknown): value is LaunchHeroChoice {
  return typeof value === 'string' && (LAUNCH_HERO_CHOICES as readonly string[]).includes(value)
}

export interface LaunchHeroInput {
  storeName: string
  /** The tagline, or the store type's hero line. */
  line: string
  orderTypes: readonly OnboardingOrderType[]
  /** Display names, e.g. ["GCash", "Cash"]. */
  paymentNames: readonly string[]
  hours: { open: string; close: string; closedDays: readonly number[] }
  /** The owner's best sellers as they are on the menu. */
  favorites: ReadonlyArray<{ name: string; price: number }>
  /** The storefront's button color (`button_primary_color`). */
  buttonColor: string
}

/** Fewer than this many order types / best sellers and their hero has nothing to show. */
const MIN_WAYS = 2
const MIN_FAVORITES = 2
const MAX_FAVORITES = 3
const MAX_NAME = 60
const MAX_LINE = 160
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const ORDER_WAYS: Record<OnboardingOrderType, { icon: string; label: string; line: string; step: string }> = {
  dine_in: { icon: 'UtensilsCrossed', label: 'Dine in', line: 'Order ahead and enjoy it here.', step: 'enjoy it here' },
  pickup: { icon: 'ShoppingBag', label: 'Pickup', line: 'Order now, pick it up when it’s ready.', step: 'pick it up' },
  delivery: { icon: 'Truck', label: 'Delivery', line: 'Order now and we bring it to you.', step: 'get it delivered' },
}

/** Which heroes this store has the facts for. */
export function availableLaunchHeroes(input: Pick<LaunchHeroInput, 'orderTypes' | 'favorites'>): LaunchHeroChoice[] {
  return LAUNCH_HERO_CHOICES.filter((hero) => {
    if (hero === 'ways') return input.orderTypes.length >= MIN_WAYS
    if (hero === 'favorites') return input.favorites.length >= MIN_FAVORITES
    return true
  })
}

// ── Words ─────────────────────────────────────────────────────────────────

/** Owner text as plain words: hero text widgets read `*`, `**` and `[..](..)` as markup. */
function plain(value: string, max: number): string {
  return value.replace(/\*/g, '').replace(/\[/g, '(').replace(/\]/g, ')').replace(/\s+/g, ' ').trim().slice(0, max)
}

export function formatClock(hhmm: string): string {
  const [hours, minutes] = hhmm.split(':').map(Number)
  const suffix = hours < 12 ? 'AM' : 'PM'
  const twelve = hours % 12 === 0 ? 12 : hours % 12
  return `${twelve}:${String(minutes).padStart(2, '0')} ${suffix}`
}

export function hoursLine(hours: LaunchHeroInput['hours']): string {
  const open = `${formatClock(hours.open)} – ${formatClock(hours.close)}`
  if (hours.closedDays.length === 0) return `Open daily, ${open}`
  const closed = [...hours.closedDays].sort((a, b) => a - b).map((day) => DAY_NAMES[day]).join(', ')
  return `Open ${open} · Closed ${closed}`
}

/** "GCash, Maya or cash". */
function joinOr(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? ''
  return `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function peso(amount: number): string {
  return `₱${Number.isInteger(amount) ? amount : amount.toFixed(2)}`
}

// ── Pieces ────────────────────────────────────────────────────────────────

const PAGE: NodeStyle = { padding: box(72, 24, 32, 24), background: { type: 'color', color: '@background' } }
const PAGE_MOBILE: NodeStyle = { padding: box(32, 16, 16, 16) }
const ROW: NodeStyle = { padding: box(8, 24, 64, 24), gap: 16, align: 'stretch', background: { type: 'color', color: '@background' } }
const ROW_MOBILE: NodeStyle = { padding: box(8, 16, 12, 16), gap: 12 }
const CARD: NodeStyle = { gap: 10, padding: box(24), radius: 18, background: { type: 'color', color: '@surface' } }

function titleSection(input: LaunchHeroInput, label: string, extra: ReturnType<typeof widget>[] = []): Section {
  return section({
    label,
    widths: [100],
    style: PAGE,
    mobile: PAGE_MOBILE,
    columns: [{
      style: { gap: 16, textAlign: 'center' },
      widgets: [
        heading(plain(input.storeName, MAX_NAME), 'h1', { ...DISPLAY, textAlign: 'center' }, DISPLAY_MOBILE),
        text(plain(input.line, MAX_LINE), { ...LEAD, color: '@muted', maxWidth: 640, textAlign: 'center' }, LEAD_MOBILE),
        ...extra,
        buttons([button('View menu', MENU_ANCHOR, 'solid', 'ArrowRight')], { textAlign: 'center', margin: box(4, 0, 0, 0) }),
      ],
    }],
  })
}

/**
 * A card that stays small on phones, so the menu starts near the top: a
 * `tile` sits in one row (icon + label), a `step` stacks without its icon.
 */
function cardColumn(icon: string, title: string, body: string, variant: 'tile' | 'step'): ColumnSpec {
  const isTile = variant === 'tile'
  return {
    style: CARD,
    mobile: isTile ? { padding: box(12, 8), gap: 6, textAlign: 'center', align: 'center' } : { padding: box(14, 16), gap: 4 },
    widgets: [
      widget('icon', { name: icon }, { size: 22, color: '@text', textAlign: 'left', accentColor: '@background', padding: box(12), radius: 999 },
        isTile ? { size: 18, padding: box(8), textAlign: 'center' } : { hidden: true }),
      heading(title, 'h3', { fontSize: 20, fontWeight: 700, lineHeight: 1.25 }, { fontSize: isTile ? 14 : 16 }),
      text(body, { fontSize: 15, color: '@muted' }, isTile ? { hidden: true } : { fontSize: 13 }),
    ],
  }
}

function cardRow(label: string, columns: ColumnSpec[], mobile: NodeStyle = ROW_MOBILE): Section {
  const width = Math.floor(100 / columns.length)
  const widths = columns.map((_, index) => (index === columns.length - 1 ? 100 - width * (columns.length - 1) : width))
  return section({ label, widths, style: ROW, mobile, columns })
}

// ── Heroes ────────────────────────────────────────────────────────────────

function waysHero(input: LaunchHeroInput): Section[] {
  const ways = input.orderTypes.map((type) => ORDER_WAYS[type])
  return [
    titleSection(input, 'Store'),
    cardRow('Ways to order', ways.map((way) => cardColumn(way.icon, way.label, way.line, 'tile')), { ...ROW_MOBILE, stack: false, gap: 8 }),
  ]
}

function stepsHero(input: LaunchHeroInput): Section[] {
  const finish = capitalize(joinOr(input.orderTypes.map((type) => ORDER_WAYS[type].step)))
  const pay = input.paymentNames.length > 0 ? `${joinOr(input.paymentNames)}.` : 'Choose how you pay at checkout.'
  return [
    titleSection(input, 'Store'),
    cardRow('How it works', [
      cardColumn('Utensils', '1. Pick your favorites', 'Browse the menu and add them to your cart.', 'step'),
      cardColumn('Wallet', '2. Pay your way', pay, 'step'),
      cardColumn('Check', `3. ${finish}`, 'We get your order ready.', 'step'),
    ], { ...ROW_MOBILE, gap: 8 }),
  ]
}

function favoritesHero(input: LaunchHeroInput): Section[] {
  const favorites = input.favorites.slice(0, MAX_FAVORITES)
  return [
    titleSection(input, 'Store', [badge('Our best sellers', 'Star', { color: '@text', accentColor: '@text', background: { type: 'color', color: '@surface' } })]),
    cardRow('Best sellers', favorites.map((item) => ({
      style: { ...CARD, textAlign: 'center' },
      mobile: { padding: box(12, 8), gap: 4 },
      widgets: [
        heading(plain(item.name, MAX_NAME), 'h3', { fontSize: 20, fontWeight: 700, lineHeight: 1.25, textAlign: 'center' }, { fontSize: 14 }),
        text(peso(item.price), { fontSize: 17, fontWeight: 700, textAlign: 'center' }, { fontSize: 14 }),
      ],
    })), { ...ROW_MOBILE, stack: false, gap: 8 }),
  ]
}

function posterHero(input: LaunchHeroInput): Section[] {
  const ways = input.orderTypes.map((type) => listItem(ORDER_WAYS[type].icon, ORDER_WAYS[type].label))
  return [section({
    label: 'Poster',
    widths: [100],
    // The band takes the store's ink as its color, so light text reads on any brand.
    style: { padding: box(88, 24), background: { type: 'color', color: '@text' }, color: '@background' },
    mobile: { padding: box(44, 16) },
    columns: [{
      style: { gap: 18, textAlign: 'center' },
      widgets: [
        heading(plain(input.storeName, MAX_NAME), 'h1', { ...DISPLAY, fontSize: 68, textTransform: 'uppercase', textAlign: 'center', color: '@background' }, DISPLAY_MOBILE),
        text(plain(input.line, MAX_LINE), { ...LEAD, maxWidth: 640, textAlign: 'center', color: '@background', opacity: 85 }, LEAD_MOBILE),
        iconList([listItem('Clock', hoursLine(input.hours)), ...ways], 'inline', { fontSize: 14, color: '@background', accentColor: '@background', textAlign: 'center' }),
        buttons([button('View menu', MENU_ANCHOR, 'solid', 'ArrowRight')], { textAlign: 'center', margin: box(6, 0, 0, 0) }),
      ],
    }],
  })]
}

const BUILDERS: Record<LaunchHero, (input: LaunchHeroInput) => Section[]> = {
  ways: waysHero,
  steps: stepsHero,
  favorites: favoritesHero,
  poster: posterHero,
}

export function buildLaunchHero(hero: LaunchHero, input: LaunchHeroInput): HeroDesignV5 {
  return design(BUILDERS[hero](input), { colors: { primary: input.buttonColor } })
}
