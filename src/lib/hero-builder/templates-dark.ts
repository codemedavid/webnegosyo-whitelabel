// ---------------------------------------------------------------------------
// Hero Builder v5 — dark and photo-backed starting designs (late-night neon,
// chalkboard specials, fine dining, card on photo). Registered in
// templates.ts; every builder returns a fresh design from the kit.
//
// Text over dark or photographic backgrounds uses explicit colors (a store's
// @text is tuned for its light menu); buttons and highlights keep theme refs
// where they stay readable.
// ---------------------------------------------------------------------------

import {
  LEAD,
  LEAD_MOBILE,
  MENU_ANCHOR,
  PHOTOS,
  WHITE,
  WHITE_SOFT,
  animate,
  badge,
  box,
  button,
  buttons,
  darkOverlay,
  design,
  heading,
  highlightList,
  iconList,
  image,
  listItem,
  photo,
  section,
  text,
  widget,
} from './section-presets'
import { photoAt, type TemplateBand, type TemplateCopy } from './template-copy'
import type { HeroDesignV5 } from './types'

// ── Late-night neon ────────────────────────────────────────────────────────

const NIGHT = '#07070c'
const NIGHT_GLOW = '#2b0f3f'
const NEON_PINK = '#f472b6'
const NEON_CYAN = '#22d3ee'

export function buildLateNightNeon(): HeroDesignV5 {
  const hero = section({
    label: 'Hero — late-night neon',
    widths: [56, 44],
    style: {
      padding: box(104, 24),
      gap: 56,
      color: WHITE,
      background: { type: 'gradient', gradient: { kind: 'radial', from: NIGHT_GLOW, to: NIGHT, angle: 0 } },
    },
    mobile: { padding: box(48, 16, 56, 16), gap: 32 },
    columns: [
      {
        style: { gap: 20, verticalAlign: 'center' },
        mobile: { textAlign: 'center', gap: 16 },
        widgets: [
          animate(
            badge('Open till 3 AM', 'Moon', {
              color: NEON_PINK,
              accentColor: NEON_PINK,
              borderWidth: 1,
              borderColor: NEON_PINK,
              background: { type: 'color', color: 'rgba(244,114,182,0.12)' },
            }),
            'fade',
          ),
          animate(
            heading('Midnight *cravings*, handled.', 'h1', { fontFamily: 'bebas-neue', fontSize: 120, fontWeight: 400, lineHeight: 0.9, letterSpacing: 1, color: WHITE }, { fontSize: 68 }),
            'slide-up',
            80,
          ),
          animate(
            text('Wings, loaded fries, sisig and ice-cold drinks — cooked to order and delivered while the night is still young.', { ...LEAD, color: 'rgba(255,255,255,0.72)', maxWidth: 500 }, LEAD_MOBILE),
            'slide-up',
            160,
          ),
          animate(
            buttons([button('Order now', MENU_ANCHOR, 'solid', 'Zap'), button('View menu', MENU_ANCHOR, 'outline')], {
              accentColor: NEON_PINK,
              accentTextColor: NIGHT,
              radius: 999,
              margin: box(8, 0, 0, 0),
            }),
            'slide-up',
            240,
          ),
          iconList(
            [listItem('Bike', 'Midnight delivery'), listItem('Users', 'Barkada platters'), listItem('Beer', 'Cold drinks')],
            'inline',
            { fontSize: 14, gap: 22, color: 'rgba(255,255,255,0.78)', accentColor: NEON_CYAN, margin: box(12, 0, 0, 0) },
            { textAlign: 'center', gap: 14 },
          ),
        ],
      },
      {
        style: { verticalAlign: 'center' },
        widgets: [
          animate(
            image(photo(PHOTOS.burger), 'A loaded late-night burger', { radius: 28, aspectRatio: '4/3', borderWidth: 2, borderColor: NEON_CYAN, shadow: 'xl' }, { radius: 20 }),
            'zoom',
            150,
          ),
        ],
      },
    ],
  })
  return design([hero])
}

// ── Chalkboard specials ────────────────────────────────────────────────────

const CHALKBOARD = '#1f2a24'
const CHALK = '#f5f1e8'
const CHALK_YELLOW = '#fde68a'
export const CHALKBOARD_BAND: TemplateBand = { background: CHALKBOARD, title: CHALK_YELLOW }

/** Highlights are the board's lines (dish — price). */
export const CHALKBOARD_SAMPLE: TemplateCopy = {
  kicker: 'Today’s specials',
  headline: 'Written fresh on the board every morning',
  body: '',
  highlights: [
    { icon: 'Utensils', label: 'Sizzling pork sisig rice — ₱189' },
    { icon: 'Soup', label: 'Beef sinigang sa miso — ₱245' },
    { icon: 'Fish', label: 'Grilled bangus belly — ₱229' },
    { icon: 'CupSoda', label: 'Calamansi cooler — ₱65' },
  ],
  primaryCta: 'Order today',
  secondaryCta: 'View menu',
  photos: [{ url: photo(PHOTOS.riceBowl), alt: 'A bowl from today’s specials' }],
}

/** Uses one square photo; `body` is not shown. */
export function buildChalkboard(copy: TemplateCopy = CHALKBOARD_SAMPLE): HeroDesignV5 {
  const picture = photoAt(copy, CHALKBOARD_SAMPLE, 0)
  const hero = section({
    label: 'Hero — chalkboard specials',
    widths: [50, 50],
    style: { padding: box(96, 24), gap: 56, color: CHALK, background: { type: 'color', color: CHALKBOARD } },
    mobile: { padding: box(48, 16), gap: 32 },
    columns: [
      {
        style: { gap: 18, verticalAlign: 'center' },
        mobile: { textAlign: 'center', gap: 14 },
        widgets: [
          animate(text(copy.kicker, { fontFamily: 'caveat', fontSize: 34, fontWeight: 700, color: CHALK_YELLOW }, { fontSize: 28 }), 'fade'),
          animate(
            heading(copy.headline, 'h1', { fontFamily: 'caveat', fontSize: 76, fontWeight: 700, lineHeight: 1, color: CHALK }, { fontSize: 50 }),
            'slide-up',
            80,
          ),
          widget('divider', { lineStyle: 'dashed' }, { size: 2, accentColor: 'rgba(245,241,232,0.35)', margin: box(4, 0) }),
          ...highlightList(
            copy.highlights,
            'vertical',
            { fontFamily: 'caveat', fontSize: 26, gap: 10, size: 20, color: CHALK, accentColor: CHALK_YELLOW },
            { fontSize: 22, textAlign: 'left' },
          ),
          buttons([button(copy.primaryCta, MENU_ANCHOR, 'solid', 'ChefHat'), button(copy.secondaryCta, MENU_ANCHOR, 'outline')], {
            accentColor: CHALK_YELLOW,
            accentTextColor: CHALKBOARD,
            radius: 6,
            margin: box(8, 0, 0, 0),
          }),
        ],
      },
      {
        style: { verticalAlign: 'center' },
        widgets: [
          animate(
            image(picture.url, picture.alt, { radius: 8, aspectRatio: '1/1', borderWidth: 10, borderColor: CHALK, shadow: 'xl' }, { aspectRatio: '4/3', borderWidth: 6 }),
            'fade',
            150,
          ),
        ],
      },
    ],
  })
  return design([hero])
}

// ── Fine dining ────────────────────────────────────────────────────────────

const GOLD = '#c9a96e'
const FINE_DINING_INK = '#0c0a09'
export const FINE_DINING_BAND: TemplateBand = { background: FINE_DINING_INK, title: GOLD }

export const FINE_DINING_SAMPLE: TemplateCopy = {
  kicker: 'Est. 2012 · Makati',
  headline: 'An evening worth *savoring*',
  body: 'A seasonal tasting menu and our chef’s classics — now plated for your home, with the same care as our dining room.',
  highlights: [],
  primaryCta: 'View the menu',
  secondaryCta: 'Order for pickup',
  photos: [{ url: photo(PHOTOS.diningRoom, 2000), alt: '' }],
}

/** Uses one photo, as the background; no highlights. */
export function buildFineDining(copy: TemplateCopy = FINE_DINING_SAMPLE): HeroDesignV5 {
  const backdrop = photoAt(copy, FINE_DINING_SAMPLE, 0)
  const hero = section({
    label: 'Hero — fine dining',
    widths: [100],
    style: {
      fullHeight: true,
      verticalAlign: 'center',
      padding: box(120, 24),
      color: WHITE,
      background: {
        type: 'image',
        color: FINE_DINING_INK,
        image: { url: backdrop.url, size: 'cover', position: 'center' },
        overlay: darkOverlay(68),
      },
    },
    mobile: { padding: box(96, 20, 80, 20) },
    columns: [
      {
        style: { gap: 22, textAlign: 'center' },
        widgets: [
          animate(text(copy.kicker, { fontSize: 13, fontWeight: 500, letterSpacing: 6, textTransform: 'uppercase', color: GOLD, textAlign: 'center' }, { fontSize: 12, letterSpacing: 4 }), 'fade'),
          animate(
            heading(copy.headline, 'h1', { fontFamily: 'cormorant-garamond', fontSize: 92, fontWeight: 500, lineHeight: 1, color: WHITE, maxWidth: 900, textAlign: 'center' }, { fontSize: 52 }),
            'fade',
            150,
            1200,
          ),
          widget('divider', {}, { size: 1, accentColor: GOLD, maxWidth: 96, textAlign: 'center', margin: box(4, 0) }),
          animate(
            text(copy.body, { ...LEAD, color: WHITE_SOFT, maxWidth: 600, textAlign: 'center' }, LEAD_MOBILE),
            'fade',
            300,
            1200,
          ),
          animate(
            buttons([button(copy.primaryCta, MENU_ANCHOR, 'solid'), button(copy.secondaryCta, MENU_ANCHOR, 'outline')], {
              textAlign: 'center',
              accentColor: GOLD,
              accentTextColor: FINE_DINING_INK,
              radius: 0,
              letterSpacing: 2,
              textTransform: 'uppercase',
              fontSize: 14,
              margin: box(12, 0, 0, 0),
            }),
            'fade',
            450,
            1200,
          ),
        ],
      },
    ],
  })
  return design([hero])
}

// ── Card on photo ──────────────────────────────────────────────────────────

export const CARD_ON_PHOTO_SAMPLE: TemplateCopy = {
  kicker: 'Now open for delivery',
  headline: 'Your favorite table, now at home',
  body: 'Everything from our dining room menu, packed carefully and delivered hot across the city.',
  highlights: [{ icon: 'Star', label: '4.8 · 900+ reviews' }, { icon: 'Clock', label: 'Ready in 25 min' }],
  primaryCta: 'Order now',
  secondaryCta: 'View menu',
  photos: [{ url: photo(PHOTOS.restaurant, 2000), alt: '' }],
}

/** Uses one photo, as the background. */
export function buildCardOnPhoto(copy: TemplateCopy = CARD_ON_PHOTO_SAMPLE): HeroDesignV5 {
  const backdrop = photoAt(copy, CARD_ON_PHOTO_SAMPLE, 0)
  const hero = section({
    label: 'Hero — card on photo',
    widths: [46, 54],
    style: {
      minHeight: 640,
      padding: box(80, 24),
      align: 'center',
      background: {
        type: 'image',
        color: '#1c1917',
        image: { url: backdrop.url, size: 'cover', position: 'center' },
        overlay: darkOverlay(25),
      },
    },
    // Phones: the photo crops to a band above the card instead of hiding behind it.
    mobile: { minHeight: 0, padding: box(200, 16, 24, 16) },
    columns: [
      {
        style: { gap: 18, padding: box(44), radius: 28, shadow: 'xl', background: { type: 'color', color: '@background' } },
        mobile: { padding: box(28, 22), radius: 22, textAlign: 'center', gap: 14 },
        widgets: [
          animate(badge(copy.kicker, 'Store'), 'fade'),
          animate(heading(copy.headline, 'h1', { fontSize: 48, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1 }, { fontSize: 32 }), 'slide-up', 80),
          text(copy.body, { fontSize: 17, lineHeight: 1.6 }, { fontSize: 15 }),
          buttons([button(copy.primaryCta, MENU_ANCHOR, 'solid', 'ShoppingBag'), button(copy.secondaryCta, MENU_ANCHOR, 'outline')]),
          ...highlightList(
            copy.highlights,
            'inline',
            { fontSize: 13, gap: 16, color: '@muted', accentColor: '@primary', margin: box(4, 0, 0, 0) },
            { textAlign: 'center' },
          ),
        ],
      },
      // Keeps the photo visible beside the card on wide screens; nothing to show on phones.
      { widgets: [], mobile: { hidden: true } },
    ],
  })
  return design([hero])
}
