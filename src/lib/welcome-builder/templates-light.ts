// ---------------------------------------------------------------------------
// Welcome templates — bright, everyday storefronts. Each build() returns a new
// design with fresh ids, and every one carries a way to start ordering.
// ---------------------------------------------------------------------------

import {
  DISPLAY,
  DISPLAY_MOBILE,
  LEAD,
  LEAD_MOBILE,
  PHOTOS,
  animate,
  badge,
  box,
  design,
  heading,
  iconList,
  image,
  listItem,
  photo,
  section,
  text,
} from '@/lib/hero-builder/section-presets'
import type { HeroDesignV5 } from '@/lib/hero-builder/types'

import { NARROW, entry, logo, slide, slideshow } from './kit'

/** The shipped welcome screen, rebuilt as a design: logo, greeting, tiles. */
export function buildClassicWelcome(): HeroDesignV5 {
  const page = section({
    label: 'Welcome',
    widths: [100],
    style: { fullHeight: true, verticalAlign: 'center', contentWidth: NARROW, padding: box(56, 20), background: { type: 'color', color: '@background' } },
    mobile: { padding: box(40, 20) },
    columns: [
      {
        style: { gap: 18, textAlign: 'center' },
        widgets: [
          animate(logo({ size: 84 }, undefined, 'none'), 'fade'),
          animate(heading('Welcome to {store}', 'h1', { fontFamily: 'heading', fontSize: 34, fontWeight: 800, lineHeight: 1.1, textAlign: 'center', color: '@text' }, { fontSize: 28 }), 'slide-up', 80),
          animate(text('How would you like your order?', { fontSize: 17, color: '@muted', textAlign: 'center' }), 'slide-up', 140),
          animate(entry('tiles', {}, { margin: box(10, 0, 0, 0) }), 'slide-up', 200),
        ],
      },
    ],
  })
  return design([page])
}

/** Promos up top, then the choice — for stores that always have a deal on. */
export function buildPromoFirst(): HeroDesignV5 {
  const page = section({
    label: 'Welcome — promos',
    widths: [100],
    style: { fullHeight: true, contentWidth: 640, padding: box(40, 20, 48, 20), background: { type: 'color', color: '@background' } },
    mobile: { padding: box(24, 16, 36, 16) },
    columns: [
      {
        style: { gap: 18 },
        widgets: [
          logo({ size: 56, textAlign: 'left', fontSize: 22 }, { size: 48 }, 'none'),
          heading('This week at {store}', 'h1', { fontFamily: 'heading', fontSize: 30, fontWeight: 800, lineHeight: 1.15, color: '@text' }, { fontSize: 24 }),
          slideshow(
            [
              slide(photo(PHOTOS.pizza, 1400), 'Buy 1 Take 1 pizza', 'Every Tuesday, all day'),
              slide(photo(PHOTOS.burger, 1400), 'New: Double smash burger', 'Now on the menu'),
              slide(photo(PHOTOS.salad, 1400), 'Free side salad', 'On orders over ₱500'),
            ],
            { aspectRatio: '16/9', radius: 20 },
            { aspectRatio: '4/3' },
          ),
          text('Choose how you would like your order:', { fontSize: 15, fontWeight: 600, color: '@muted', margin: box(6, 0, 0, 0) }),
          entry('tiles', {}, { textAlign: 'left' }),
        ],
      },
    ],
  })
  return design([page])
}

const CREAM = '#fbf3e6'
const COCOA = '#3b2a1a'
const COCOA_SOFT = 'rgba(59,42,26,0.72)'
const CARAMEL = '#b4733a'

/** Warm café page: serif greeting, a hero photo and a tidy list of choices. */
export function buildCafeMorning(): HeroDesignV5 {
  const page = section({
    label: 'Welcome — café',
    widths: [100],
    style: { fullHeight: true, verticalAlign: 'center', contentWidth: 520, padding: box(48, 20), background: { type: 'color', color: CREAM }, color: COCOA },
    mobile: { padding: box(32, 18) },
    columns: [
      {
        style: { gap: 16, textAlign: 'center' },
        widgets: [
          logo({ size: 64, fontFamily: 'fraunces', color: COCOA }),
          animate(image(photo(PHOTOS.coffeeBar, 1200), 'Coffee being poured at the bar', { radius: 999, aspectRatio: '1/1', maxWidth: 220, align: 'center', shadow: 'lg' }, { maxWidth: 180 }), 'zoom'),
          heading('Good morning.', 'h1', { fontFamily: 'fraunces', fontSize: 48, fontWeight: 600, letterSpacing: -1, lineHeight: 1.05, color: COCOA, textAlign: 'center' }, { fontSize: 38 }),
          text('Freshly pulled espresso and pastries from the oven at {store}.', { fontSize: 17, lineHeight: 1.55, color: COCOA_SOFT, textAlign: 'center', maxWidth: 400 }, { fontSize: 15 }),
          entry('list', { blurbs: { dine_in: 'Grab a seat, we bring it over', pickup: 'Skip the line', delivery: 'Coffee at your door' } }, {
            accentColor: '#ffffff',
            accentTextColor: COCOA,
            color: CARAMEL,
            radius: 16,
            gap: 10,
            margin: box(8, 0, 0, 0),
          }),
        ],
      },
    ],
  })
  return design([page], { headingFont: 'fraunces' })
}

/** Photo on one side, greeting and choices on the other; stacks on phones. */
export function buildSplitPhoto(): HeroDesignV5 {
  const page = section({
    label: 'Welcome — split',
    widths: [50, 50],
    style: { fullHeight: true, contentWidth: 0, padding: box(0), gap: 0, align: 'stretch', background: { type: 'color', color: '@background' } },
    tablet: { padding: box(0) },
    mobile: { padding: box(0), gap: 0 },
    columns: [
      {
        style: { background: { type: 'image', color: '#1c1917', image: { url: photo(PHOTOS.diningRoom, 1600), size: 'cover', position: 'center' } }, minHeight: 320 },
        mobile: { minHeight: 240 },
        widgets: [],
      },
      {
        style: { gap: 18, verticalAlign: 'center', padding: box(64, 56) },
        tablet: { padding: box(48, 32) },
        mobile: { padding: box(28, 20, 40, 20), textAlign: 'center' },
        widgets: [
          logo({ size: 60, textAlign: 'left', fontSize: 24 }, { textAlign: 'center' }),
          heading('A table is waiting for you', 'h1', { ...DISPLAY, fontFamily: 'heading', fontSize: 52, color: '@text' }, DISPLAY_MOBILE),
          text('Order from {store} for dine-in, pickup or delivery.', { ...LEAD, color: '@muted' }, LEAD_MOBILE),
          entry('list', {}, { textAlign: 'left', margin: box(8, 0, 0, 0) }),
        ],
      },
    ],
  })
  return design([page])
}

const LEAF = '#15803d'
const LEAF_TINT = '#ecfdf3'

/** Fresh and healthy: perks first, then a single start button. */
export function buildFreshStart(): HeroDesignV5 {
  const page = section({
    label: 'Welcome — fresh',
    widths: [100],
    style: { fullHeight: true, verticalAlign: 'center', contentWidth: NARROW, padding: box(56, 20), background: { type: 'gradient', gradient: { kind: 'linear', from: LEAF_TINT, to: '#ffffff', angle: 180 } } },
    mobile: { padding: box(40, 18) },
    columns: [
      {
        style: { gap: 18, textAlign: 'center' },
        widgets: [
          logo({ size: 72 }),
          badge('Made fresh every morning', 'Leaf', { color: LEAF, accentColor: LEAF, background: { type: 'color', color: '#ffffff' } }),
          heading('Eat well, feel great', 'h1', { ...DISPLAY, fontSize: 46, color: '#052e16', textAlign: 'center' }, { fontSize: 34 }),
          iconList(
            [listItem('Sprout', 'Locally grown greens'), listItem('Timer', 'Ready in 15 minutes'), listItem('Truck', 'Free delivery over ₱500')],
            'vertical',
            { fontSize: 16, color: '#14532d', accentColor: LEAF, maxWidth: 320, align: 'center', textAlign: 'left' },
          ),
          entry('cta', { ctaLabel: 'Start my order' }, { accentColor: LEAF, accentTextColor: '#ffffff', radius: 999, align: 'stretch', fontSize: 17, margin: box(8, 0, 0, 0) }),
        ],
      },
    ],
  })
  return design([page])
}

/** Nothing but the logo, the name and one button. */
export function buildJustTheButton(): HeroDesignV5 {
  const page = section({
    label: 'Welcome — minimal',
    widths: [100],
    style: { fullHeight: true, verticalAlign: 'center', contentWidth: 440, padding: box(48, 24), background: { type: 'color', color: '@background' } },
    columns: [
      {
        style: { gap: 22, textAlign: 'center' },
        widgets: [
          animate(logo({ size: 112 }, { size: 96 }), 'zoom'),
          animate(text('Order online from {store}', { fontSize: 15, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 600, color: '@muted', textAlign: 'center' }), 'fade', 120),
          animate(entry('cta', { ctaLabel: 'Start ordering' }, { align: 'stretch', radius: 14, fontSize: 17 }), 'slide-up', 200),
        ],
      },
    ],
  })
  return design([page])
}
