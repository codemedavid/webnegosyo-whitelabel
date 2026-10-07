// ---------------------------------------------------------------------------
// Hero Builder v5 — light-background starting designs (editorial, mosaic,
// bakery, fresh, big numbers, how-it-works). Registered in templates.ts; every
// builder returns a fresh design made only from the section-presets kit.
// ---------------------------------------------------------------------------

import {
  DISPLAY,
  DISPLAY_MOBILE,
  LEAD,
  LEAD_MOBILE,
  MENU_ANCHOR,
  PHOTOS,
  WHITE,
  WHITE_GLASS,
  WHITE_SOFT,
  animate,
  badge,
  box,
  button,
  buttons,
  design,
  galleryImage,
  heading,
  iconList,
  image,
  listItem,
  photo,
  section,
  text,
  widget,
  type ColumnSpec,
} from './section-presets'
import type { Background, HeroDesignV5, NodeStyle } from './types'

const SERIF_DISPLAY: NodeStyle = { fontFamily: 'fraunces', fontWeight: 600, lineHeight: 1.02, letterSpacing: -2 }
const KICKER: NodeStyle = { fontSize: 13, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: '@primary' }

// ── Editorial ──────────────────────────────────────────────────────────────

function editorialStat(value: string, label: string): ColumnSpec {
  return {
    style: { gap: 4, padding: box(20, 0, 0, 0) },
    mobile: { textAlign: 'center' },
    widgets: [
      heading(value, 'p', { ...SERIF_DISPLAY, fontSize: 52, color: '@text' }, { fontSize: 40 }),
      text(label, { fontSize: 14, letterSpacing: 1, textTransform: 'uppercase', color: '@muted' }, { fontSize: 13 }),
    ],
  }
}

export function buildEditorial(): HeroDesignV5 {
  const hero = section({
    label: 'Hero — editorial',
    widths: [56, 44],
    style: { padding: box(104, 24, 56, 24), gap: 64, align: 'end', background: { type: 'color', color: '@background' } },
    tablet: { padding: box(80, 24, 40, 24), gap: 40 },
    mobile: { padding: box(48, 20, 24, 20), gap: 28 },
    columns: [
      {
        style: { gap: 22 },
        mobile: { textAlign: 'center', gap: 16 },
        widgets: [
          text('No. 07 — The Sunday Table', KICKER, { fontSize: 12, letterSpacing: 2 }),
          widget('divider', {}, { size: 2, accentColor: '@text', maxWidth: 72, margin: box(0) }, { maxWidth: 56, textAlign: 'center' }),
          animate(
            heading('Cooked slowly. *Shared* generously.', 'h1', { ...SERIF_DISPLAY, fontSize: 84 }, { fontSize: 46, letterSpacing: -1 }),
            'slide-up',
          ),
          animate(
            text('Recipes passed down three generations, cooked in small batches every morning and packed for your table at home.', { ...LEAD, maxWidth: 520 }, LEAD_MOBILE),
            'fade',
            150,
          ),
          buttons([button('Order now', MENU_ANCHOR, 'solid', 'ArrowRight'), button('View menu', MENU_ANCHOR, 'ghost')], { radius: 0, letterSpacing: 0.5 }),
        ],
      },
      {
        style: { gap: 10 },
        widgets: [
          animate(
            image(photo(PHOTOS.plated), 'A plated signature dish', { radius: 0, aspectRatio: '3/4', shadow: 'lg' }, { aspectRatio: '4/3' }),
            'fade',
            100,
            1000,
          ),
          text('*Above:* the grilled seafood platter, Sundays only.', { fontSize: 13, color: '@muted', italic: true }, { fontSize: 13, textAlign: 'center' }),
        ],
      },
    ],
  })
  const stats = section({
    label: 'Editorial numbers',
    widths: [33, 34, 33],
    style: { padding: box(0, 24, 88, 24), gap: 40, background: { type: 'color', color: '@background' } },
    mobile: { padding: box(8, 20, 48, 20), gap: 8 },
    columns: [
      editorialStat('3', 'Generations of recipes'),
      editorialStat('40+', 'Dishes, cooked daily'),
      editorialStat('30 min', 'Average delivery'),
    ],
  })
  return design([hero, stats])
}

// ── Photo mosaic ───────────────────────────────────────────────────────────

const MOSAIC_SHOTS: readonly [keyof typeof PHOTOS, string][] = [
  ['bowl', 'Fresh rice bowl'],
  ['pizza', 'Wood-fired pizza'],
  ['ramen', 'Steaming noodle soup'],
  ['pancakes', 'Pancakes with berries'],
]

export function buildPhotoMosaic(): HeroDesignV5 {
  const hero = section({
    label: 'Hero — photo mosaic',
    widths: [46, 54],
    style: { padding: box(96, 24), gap: 56, background: { type: 'gradient', gradient: { kind: 'linear', from: '@background', to: '@surface', angle: 160 } } },
    tablet: { gap: 32 },
    mobile: { padding: box(40, 16, 48, 16), gap: 28, reverse: true },
    columns: [
      {
        style: { gap: 20, verticalAlign: 'center' },
        mobile: { textAlign: 'center', gap: 16 },
        widgets: [
          animate(badge('40+ dishes · Made fresh daily', 'Utensils'), 'fade'),
          animate(heading('Something delicious for every craving', 'h1', DISPLAY, DISPLAY_MOBILE), 'slide-up', 80),
          animate(text('Rice bowls, noodles, pizza and all-day breakfast — mix and match in one order, delivered together.', LEAD, LEAD_MOBILE), 'slide-up', 160),
          animate(buttons([button('Order now', MENU_ANCHOR, 'solid', 'ShoppingBag'), button('View menu', MENU_ANCHOR, 'outline')]), 'slide-up', 240),
        ],
      },
      {
        widgets: [
          animate(
            widget(
              'gallery',
              { images: MOSAIC_SHOTS.map(([key, alt]) => galleryImage(photo(PHOTOS[key], 800), alt)) },
              { columns: 2, gap: 16, radius: 24, aspectRatio: '1/1' },
              { columns: 2, gap: 10, radius: 16 },
            ),
            'zoom',
            120,
          ),
        ],
      },
    ],
  })
  return design([hero])
}

// ── Bakery ─────────────────────────────────────────────────────────────────

const CREAM = '#fbf3e6'
const COCOA = '#3b2a1a'
const COCOA_SOFT = 'rgba(59,42,26,0.74)'

export function buildBakery(): HeroDesignV5 {
  const hero = section({
    label: 'Hero — bakery',
    widths: [55, 45],
    style: { padding: box(104, 24), gap: 64, contentWidth: 1120, color: COCOA, background: { type: 'color', color: CREAM } },
    tablet: { padding: box(80, 24), gap: 40 },
    mobile: { padding: box(48, 20), gap: 32 },
    columns: [
      {
        style: { gap: 20, verticalAlign: 'center' },
        mobile: { textAlign: 'center', gap: 14 },
        widgets: [
          animate(text('Baked with love', { fontFamily: 'pacifico', fontSize: 30, color: '@primary' }, { fontSize: 24 }), 'fade'),
          animate(
            heading('Warm from the oven, every single morning', 'h1', { ...SERIF_DISPLAY, fontSize: 64, letterSpacing: -1.5, color: COCOA }, { fontSize: 38, letterSpacing: -0.5 }),
            'slide-up',
            80,
          ),
          text('Buttery croissants, ensaymada and pandesal baked before sunrise. Reserve yours today — they sell out by noon.', { ...LEAD, color: COCOA_SOFT, maxWidth: 500 }, LEAD_MOBILE),
          iconList(
            [listItem('Croissant', 'Fresh batches at 6 AM'), listItem('Cake', 'Whole cakes by pre-order'), listItem('Clock', 'Pickup from 7 AM')],
            'vertical',
            { fontSize: 16, gap: 10, size: 20, color: COCOA, accentColor: '@primary', margin: box(4, 0, 8, 0) },
            { fontSize: 15, textAlign: 'left' },
          ),
          buttons([button('Reserve a box', MENU_ANCHOR, 'solid', 'ShoppingBag'), button('View menu', MENU_ANCHOR, 'ghost', 'ArrowRight')], { radius: 999 }),
        ],
      },
      {
        style: { verticalAlign: 'center' },
        widgets: [
          animate(
            image(
              photo(PHOTOS.croissants, 1200),
              'A tray of freshly baked croissants',
              { radius: 999, aspectRatio: '1/1', borderWidth: 12, borderColor: WHITE, shadow: 'xl', maxWidth: 460, align: 'center' },
              { borderWidth: 8, maxWidth: 300 },
            ),
            'zoom',
            150,
            900,
          ),
        ],
      },
    ],
  })
  return design([hero])
}

// ── Fresh & healthy ────────────────────────────────────────────────────────

const LEAF = '#15803d'
const LEAF_TINT = '#ecfdf3'

export function buildFreshHealthy(): HeroDesignV5 {
  const hero = section({
    label: 'Hero — fresh & healthy',
    widths: [52, 48],
    style: {
      padding: box(96, 24),
      gap: 56,
      background: { type: 'gradient', gradient: { kind: 'radial', from: LEAF_TINT, to: '@background', angle: 0 } },
    },
    mobile: { padding: box(40, 16, 48, 16), gap: 28 },
    columns: [
      {
        style: { gap: 20, verticalAlign: 'center' },
        mobile: { textAlign: 'center', gap: 16 },
        widgets: [
          animate(badge('100% fresh · No preservatives', 'Leaf', { color: LEAF, accentColor: LEAF, background: { type: 'color', color: LEAF_TINT } }), 'fade'),
          animate(heading('Real food that loves you back', 'h1', { ...DISPLAY, fontSize: 62 }, DISPLAY_MOBILE), 'slide-up', 80),
          animate(text('Colorful bowls, grain salads and cold-pressed juices — built by nutritionists, made to order, ready in 15 minutes.', LEAD, LEAD_MOBILE), 'slide-up', 160),
          iconList(
            [listItem('Sprout', 'Locally grown greens'), listItem('Heart', 'Calories on every item'), listItem('Leaf', 'Vegan options daily')],
            'inline',
            { fontSize: 14, fontWeight: 600, gap: 20, color: '@text', accentColor: LEAF, margin: box(4, 0, 8, 0) },
            { textAlign: 'center', gap: 12 },
          ),
          buttons([button('Order now', MENU_ANCHOR, 'solid', 'Salad'), button('View menu', MENU_ANCHOR, 'outline')], { radius: 14 }),
        ],
      },
      {
        widgets: [
          animate(
            image(photo(PHOTOS.salad), 'A colorful fresh salad bowl', { radius: 40, aspectRatio: '4/3', shadow: 'xl' }, { radius: 24 }),
            'slide-left',
            150,
          ),
        ],
      },
    ],
  })
  return design([hero])
}

// ── Big numbers ────────────────────────────────────────────────────────────

function statColumn(value: string, label: string): ColumnSpec {
  return {
    style: { gap: 4, textAlign: 'center', padding: box(24, 16), radius: 20, background: { type: 'color', color: '@background' } },
    mobile: { padding: box(18, 12) },
    widgets: [
      heading(value, 'p', { fontSize: 48, fontWeight: 800, lineHeight: 1, letterSpacing: -1, color: '@primary', textAlign: 'center' }, { fontSize: 36 }),
      text(label, { fontSize: 15, textAlign: 'center' }, { fontSize: 14 }),
    ],
  }
}

export function buildBigNumbers(): HeroDesignV5 {
  const hero = section({
    label: 'Hero — big numbers',
    widths: [100],
    style: { padding: box(112, 24, 48, 24), background: { type: 'color', color: '@surface' } },
    mobile: { padding: box(56, 16, 24, 16) },
    columns: [
      {
        style: { gap: 20, textAlign: 'center' },
        widgets: [
          animate(badge('Loved by 12,000+ neighbors', 'Heart', { accentColor: '#e11d48', background: { type: 'color', color: '@background' } }), 'fade'),
          animate(heading('The neighborhood’s favorite kitchen', 'h1', { ...DISPLAY, fontSize: 66, maxWidth: 880, textAlign: 'center' }, DISPLAY_MOBILE), 'slide-up', 80),
          animate(text('Generous servings, honest prices and food that tastes like home — no wonder people keep coming back.', { ...LEAD, maxWidth: 600, textAlign: 'center' }, LEAD_MOBILE), 'slide-up', 160),
          animate(buttons([button('Order now', MENU_ANCHOR, 'solid', 'ArrowRight'), button('View menu', MENU_ANCHOR, 'outline')], { textAlign: 'center' }), 'slide-up', 240),
        ],
      },
    ],
  })
  const numbers = section({
    label: 'Numbers',
    widths: [25, 25, 25, 25],
    style: { padding: box(24, 24, 96, 24), gap: 16, align: 'stretch', background: { type: 'color', color: '@surface' } },
    mobile: { padding: box(8, 16, 48, 16), gap: 12 },
    columns: [
      statColumn('4.9★', 'Average rating'),
      statColumn('12k+', 'Happy customers'),
      statColumn('30 min', 'Average delivery'),
      statColumn('8 yrs', 'Serving the city'),
    ],
  })
  return design([hero, numbers])
}

// ── How it works ───────────────────────────────────────────────────────────

function stepColumn(step: string, title: string, body: string): ColumnSpec {
  return {
    style: { gap: 8, padding: box(28), radius: 24, background: { type: 'color', color: WHITE_GLASS }, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
    mobile: { padding: box(22) },
    widgets: [
      heading(step, 'p', { fontFamily: 'space-grotesk', fontSize: 44, fontWeight: 700, lineHeight: 1, color: WHITE }, { fontSize: 36 }),
      heading(title, 'h3', { fontSize: 22, fontWeight: 700, lineHeight: 1.25, color: WHITE }, { fontSize: 20 }),
      text(body, { fontSize: 16, color: WHITE_SOFT }, { fontSize: 15 }),
    ],
  }
}

// The hero fades top-down into the color the steps band is filled with, so
// the two sections read as one surface with no seam between them.
function heroBackground(): Background {
  return { type: 'gradient', gradient: { kind: 'linear', from: '@primary', to: '@secondary', angle: 180 } }
}

function stepsBackground(): Background {
  return { type: 'color', color: '@secondary' }
}

export function buildHowItWorks(): HeroDesignV5 {
  const hero = section({
    label: 'Hero — how it works',
    widths: [100],
    style: { padding: box(104, 24, 40, 24), color: WHITE, background: heroBackground() },
    mobile: { padding: box(56, 16, 24, 16) },
    columns: [
      {
        style: { gap: 18, textAlign: 'center' },
        widgets: [
          animate(badge('Order in under a minute', 'Zap', { color: WHITE, accentColor: WHITE, background: { type: 'color', color: WHITE_GLASS } }), 'fade'),
          animate(heading('Hungry? Three taps and it’s on the way.', 'h1', { ...DISPLAY, fontSize: 62, color: WHITE, maxWidth: 900, textAlign: 'center' }, DISPLAY_MOBILE), 'slide-up', 80),
          animate(
            buttons([button('Start my order', MENU_ANCHOR, 'solid', 'ShoppingBag')], { textAlign: 'center', accentColor: WHITE, accentTextColor: '@primary', margin: box(8, 0, 0, 0) }),
            'slide-up',
            160,
          ),
        ],
      },
    ],
  })
  const steps = section({
    label: 'Three steps',
    widths: [33, 34, 33],
    style: { padding: box(32, 24, 104, 24), gap: 20, align: 'stretch', color: WHITE, background: stepsBackground() },
    mobile: { padding: box(16, 16, 56, 16), gap: 12 },
    columns: [
      stepColumn('01', 'Pick your favorites', 'Browse the menu, customize your order and add it to your cart.'),
      stepColumn('02', 'Pay your way', 'GCash, Maya, card or cash — choose pickup or delivery.'),
      stepColumn('03', 'We bring it hot', 'Track your order live and get a message the moment it leaves.'),
    ],
  })
  return design([hero, steps])
}
