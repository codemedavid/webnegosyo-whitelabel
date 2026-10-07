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
  iconList,
  image,
  listItem,
  photo,
  section,
  text,
  widget,
} from './section-presets'
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

export function buildChalkboard(): HeroDesignV5 {
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
          animate(text('Today’s specials', { fontFamily: 'caveat', fontSize: 34, fontWeight: 700, color: CHALK_YELLOW }, { fontSize: 28 }), 'fade'),
          animate(
            heading('Written fresh on the board every morning', 'h1', { fontFamily: 'caveat', fontSize: 76, fontWeight: 700, lineHeight: 1, color: CHALK }, { fontSize: 50 }),
            'slide-up',
            80,
          ),
          widget('divider', { lineStyle: 'dashed' }, { size: 2, accentColor: 'rgba(245,241,232,0.35)', margin: box(4, 0) }),
          iconList(
            [
              listItem('Utensils', 'Sizzling pork sisig rice — ₱189'),
              listItem('Soup', 'Beef sinigang sa miso — ₱245'),
              listItem('Fish', 'Grilled bangus belly — ₱229'),
              listItem('CupSoda', 'Calamansi cooler — ₱65'),
            ],
            'vertical',
            { fontFamily: 'caveat', fontSize: 26, gap: 10, size: 20, color: CHALK, accentColor: CHALK_YELLOW },
            { fontSize: 22, textAlign: 'left' },
          ),
          buttons([button('Order today', MENU_ANCHOR, 'solid', 'ChefHat'), button('View menu', MENU_ANCHOR, 'outline')], {
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
            image(photo(PHOTOS.riceBowl), 'A bowl from today’s specials', { radius: 8, aspectRatio: '1/1', borderWidth: 10, borderColor: CHALK, shadow: 'xl' }, { aspectRatio: '4/3', borderWidth: 6 }),
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

export function buildFineDining(): HeroDesignV5 {
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
        color: '#0c0a09',
        image: { url: photo(PHOTOS.diningRoom, 2000), size: 'cover', position: 'center' },
        overlay: darkOverlay(68),
      },
    },
    mobile: { padding: box(96, 20, 80, 20) },
    columns: [
      {
        style: { gap: 22, textAlign: 'center' },
        widgets: [
          animate(text('Est. 2012 · Makati', { fontSize: 13, fontWeight: 500, letterSpacing: 6, textTransform: 'uppercase', color: GOLD, textAlign: 'center' }, { fontSize: 12, letterSpacing: 4 }), 'fade'),
          animate(
            heading('An evening worth *savoring*', 'h1', { fontFamily: 'cormorant-garamond', fontSize: 92, fontWeight: 500, lineHeight: 1, color: WHITE, maxWidth: 900, textAlign: 'center' }, { fontSize: 52 }),
            'fade',
            150,
            1200,
          ),
          widget('divider', {}, { size: 1, accentColor: GOLD, maxWidth: 96, textAlign: 'center', margin: box(4, 0) }),
          animate(
            text('A seasonal tasting menu and our chef’s classics — now plated for your home, with the same care as our dining room.', { ...LEAD, color: WHITE_SOFT, maxWidth: 600, textAlign: 'center' }, LEAD_MOBILE),
            'fade',
            300,
            1200,
          ),
          animate(
            buttons([button('View the menu', MENU_ANCHOR, 'solid'), button('Order for pickup', MENU_ANCHOR, 'outline')], {
              textAlign: 'center',
              accentColor: GOLD,
              accentTextColor: '#0c0a09',
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

export function buildCardOnPhoto(): HeroDesignV5 {
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
        image: { url: photo(PHOTOS.restaurant, 2000), size: 'cover', position: 'center' },
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
          animate(badge('Now open for delivery', 'Store'), 'fade'),
          animate(heading('Your favorite table, now at home', 'h1', { fontSize: 48, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1 }, { fontSize: 32 }), 'slide-up', 80),
          text('Everything from our dining room menu, packed carefully and delivered hot across the city.', { fontSize: 17, lineHeight: 1.6 }, { fontSize: 15 }),
          buttons([button('Order now', MENU_ANCHOR, 'solid', 'ShoppingBag'), button('View menu', MENU_ANCHOR, 'outline')]),
          iconList(
            [listItem('Star', '4.8 · 900+ reviews'), listItem('Clock', 'Ready in 25 min')],
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
