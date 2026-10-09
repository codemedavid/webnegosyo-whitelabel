// ---------------------------------------------------------------------------
// Ready-made sections for the Welcome Builder's Add panel. They sit above the
// Hero Builder's presets (whose menu links start an order on a welcome page).
// ---------------------------------------------------------------------------

import { PHOTOS, box, heading, photo, section, text, type SectionPreset } from '@/lib/hero-builder/section-presets'
import type { Section } from '@/lib/hero-builder/types'

import { NARROW, entry, logo, slide, slideshow } from './kit'

function buildStoreIntro(): Section {
  return section({
    label: 'Store intro',
    widths: [100],
    style: { contentWidth: NARROW, padding: box(48, 20, 24, 20) },
    mobile: { padding: box(32, 16, 16, 16) },
    columns: [
      {
        style: { gap: 14, textAlign: 'center' },
        widgets: [
          logo({ size: 80 }, undefined, 'none'),
          heading('Welcome to {store}', 'h1', { fontFamily: 'heading', fontSize: 34, fontWeight: 800, lineHeight: 1.1, color: '@text', textAlign: 'center' }, { fontSize: 28 }),
          text('Freshly made, ready when you are.', { fontSize: 17, color: '@muted', textAlign: 'center' }),
        ],
      },
    ],
  })
}

function buildOrderChoices(): Section {
  return section({
    label: 'Order choices',
    widths: [100],
    style: { contentWidth: NARROW, padding: box(24, 20, 48, 20) },
    mobile: { padding: box(16, 16, 32, 16) },
    columns: [
      {
        style: { gap: 14, textAlign: 'center' },
        widgets: [
          text('**How would you like your order?**', { fontSize: 17, color: '@text', textAlign: 'center' }),
          entry('tiles'),
        ],
      },
    ],
  })
}

function buildPromoSlides(): Section {
  return section({
    label: 'Promo slideshow',
    widths: [100],
    style: { contentWidth: 720, padding: box(24, 20) },
    mobile: { padding: box(16, 16) },
    columns: [
      {
        widgets: [
          slideshow(
            [
              slide(photo(PHOTOS.burger, 1400), 'New on the menu', 'Try it this week'),
              slide(photo(PHOTOS.pancakes, 1400), 'All-day breakfast', 'Served until 3 PM'),
            ],
            { aspectRatio: '16/9', radius: 18 },
          ),
        ],
      },
    ],
  })
}

function buildStartBand(): Section {
  return section({
    label: 'Start button',
    widths: [100],
    style: { contentWidth: NARROW, padding: box(32, 20), background: { type: 'color', color: '@surface' } },
    columns: [
      {
        style: { gap: 12, textAlign: 'center' },
        widgets: [
          heading('Ready when you are', 'h2', { fontSize: 26, fontWeight: 700, color: '@text', textAlign: 'center' }),
          entry('cta', { ctaLabel: 'Start ordering', ctaIcon: 'ArrowRight' }, { align: 'stretch' }),
        ],
      },
    ],
  })
}

export const WELCOME_SECTION_PRESETS: readonly SectionPreset[] = [
  { id: 'welcome-intro', name: 'Store intro', description: 'Your logo, a greeting with your store name and one line about you.', build: buildStoreIntro },
  { id: 'welcome-choices', name: 'Order choices', description: 'A heading and one tile per order type your branches offer.', build: buildOrderChoices },
  { id: 'welcome-slides', name: 'Promo slideshow', description: 'Swipeable promo banners that play on their own.', build: buildPromoSlides },
  { id: 'welcome-start', name: 'Start button', description: 'A soft band with one big Start ordering button.', build: buildStartBand },
]
