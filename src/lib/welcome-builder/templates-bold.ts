// ---------------------------------------------------------------------------
// Welcome templates — photo, video and dark designs that make an entrance.
// Text over imagery uses fixed light colours; everything else follows the
// store's theme.
// ---------------------------------------------------------------------------

import {
  DISPLAY,
  LEAD,
  PHOTOS,
  WHITE,
  WHITE_GLASS,
  WHITE_SOFT,
  animate,
  badge,
  box,
  darkOverlay,
  design,
  heading,
  iconList,
  listItem,
  photo,
  section,
  text,
  widget,
} from '@/lib/hero-builder/section-presets'
import type { HeroDesignV5 } from '@/lib/hero-builder/types'

import { GLASS_TILES, NARROW, entry, logo } from './kit'

/** Pexels 4781575 — steak on an open grill (free licence). Merchants swap in their own clip. */
const VIDEO_URL = 'https://videos.pexels.com/video-files/4781575/4781575-hd_1920_1080_25fps.mp4'

/** Full-screen food photo, glass tiles on top. */
export function buildPhotoCover(): HeroDesignV5 {
  const page = section({
    label: 'Welcome — photo cover',
    widths: [100],
    style: {
      fullHeight: true,
      verticalAlign: 'center',
      contentWidth: 620,
      padding: box(64, 20),
      background: { type: 'image', color: '#1c1917', image: { url: photo(PHOTOS.feast, 2000), size: 'cover', position: 'center' }, overlay: darkOverlay(64) },
    },
    mobile: { padding: box(48, 18), verticalAlign: 'end' },
    columns: [
      {
        style: { gap: 18, textAlign: 'center', color: WHITE },
        widgets: [
          animate(logo({ size: 80, color: WHITE }, undefined, 'none'), 'fade'),
          animate(heading('Welcome to {store}', 'h1', { ...DISPLAY, fontSize: 54, color: WHITE, textAlign: 'center' }, { fontSize: 36 }), 'slide-up', 100),
          animate(text('Home-cooked favourites, made fresh every day.', { ...LEAD, color: WHITE_SOFT, textAlign: 'center' }, { fontSize: 16 }), 'slide-up', 180),
          animate(entry('tiles', {}, { ...GLASS_TILES, margin: box(12, 0, 0, 0) }), 'slide-up', 260),
        ],
      },
    ],
  })
  return design([page])
}

/** A looping kitchen video behind one big button. */
export function buildVideoWelcome(): HeroDesignV5 {
  const page = section({
    label: 'Welcome — video',
    widths: [100],
    style: {
      fullHeight: true,
      verticalAlign: 'center',
      contentWidth: NARROW,
      padding: box(64, 20),
      background: { type: 'video', color: '#0c0a09', videoUrl: VIDEO_URL, overlay: darkOverlay(58) },
    },
    columns: [
      {
        style: { gap: 20, textAlign: 'center', color: WHITE },
        widgets: [
          logo({ size: 76, color: WHITE }),
          badge('Now open for orders', 'Flame', { color: WHITE, accentColor: '#fbbf24', background: { type: 'color', color: WHITE_GLASS } }),
          heading('Hot off the grill', 'h1', { ...DISPLAY, fontSize: 60, color: WHITE, textAlign: 'center' }, { fontSize: 40 }),
          entry('cta', { ctaLabel: 'Start your order', ctaIcon: 'ArrowRight' }, { accentColor: WHITE, accentTextColor: '#0c0a09', radius: 999, align: 'stretch', fontSize: 17 }),
          iconList(
            [listItem('Clock', 'Ready in 20 min'), listItem('Truck', 'We deliver')],
            'inline',
            { fontSize: 14, color: WHITE_SOFT, accentColor: WHITE, textAlign: 'center' },
          ),
        ],
      },
    ],
  })
  return design([page])
}

const NIGHT = '#07070c'
const NEON_PINK = '#f472b6'
const NEON_CYAN = '#22d3ee'

/** Late-night neon: dark page, glowing type, a list that reads like a sign. */
export function buildLateNight(): HeroDesignV5 {
  const page = section({
    label: 'Welcome — late night',
    widths: [100],
    style: {
      fullHeight: true,
      verticalAlign: 'center',
      contentWidth: 520,
      padding: box(56, 20),
      background: { type: 'gradient', gradient: { kind: 'radial', from: '#2b0f3f', to: NIGHT, angle: 0 } },
    },
    columns: [
      {
        style: { gap: 18, textAlign: 'center', color: WHITE },
        widgets: [
          logo({ size: 72, color: NEON_CYAN, fontFamily: 'bebas-neue', fontSize: 40, letterSpacing: 3 }),
          heading('Open late. Always hungry.', 'h1', { fontFamily: 'bebas-neue', fontSize: 72, lineHeight: 0.95, letterSpacing: 1, color: NEON_PINK, textAlign: 'center' }, { fontSize: 54 }),
          text('Midnight cravings sorted at {store}.', { fontSize: 17, color: 'rgba(255,255,255,0.75)', textAlign: 'center' }),
          entry('list', {}, {
            accentColor: 'rgba(255,255,255,0.06)',
            accentTextColor: WHITE,
            color: NEON_CYAN,
            radius: 14,
            gap: 10,
            borderWidth: 0,
            margin: box(8, 0, 0, 0),
          }),
        ],
      },
    ],
  })
  return design([page], { headingFont: 'bebas-neue' })
}

/** A poster: giant uppercase words on the brand colour, one button. */
export function buildBoldPoster(): HeroDesignV5 {
  const page = section({
    label: 'Welcome — poster',
    widths: [100],
    style: { fullHeight: true, verticalAlign: 'between', contentWidth: 720, padding: box(48, 24), background: { type: 'color', color: '@primary' } },
    mobile: { padding: box(36, 20) },
    columns: [
      {
        style: { gap: 20, verticalAlign: 'between', minHeight: 520, color: WHITE },
        mobile: { minHeight: 480 },
        widgets: [
          logo({ size: 56, textAlign: 'left', color: WHITE, fontFamily: 'anton', fontSize: 28 }),
          heading('Hungry? Let’s fix that.', 'h1', { fontFamily: 'anton', fontSize: 104, lineHeight: 0.92, textTransform: 'uppercase', color: WHITE }, { fontSize: 64 }),
          entry('cta', { ctaLabel: 'Order now', ctaIcon: 'ArrowRight' }, { accentColor: WHITE, accentTextColor: '#111111', radius: 0, align: 'stretch', fontSize: 20, textTransform: 'uppercase', letterSpacing: 1 }),
        ],
      },
    ],
  })
  return design([page], { headingFont: 'anton' })
}

const GOLD = '#c9a96e'
const INK = '#0f0e0c'

/** Fine dining: black and gold, serif, generous space. */
export function buildFineDining(): HeroDesignV5 {
  const page = section({
    label: 'Welcome — fine dining',
    widths: [100],
    style: { fullHeight: true, verticalAlign: 'center', contentWidth: 520, padding: box(64, 24), background: { type: 'color', color: INK } },
    columns: [
      {
        style: { gap: 20, textAlign: 'center', color: '#f5efe3' },
        widgets: [
          logo({ size: 80, color: GOLD, fontFamily: 'cormorant-garamond', fontSize: 36 }),
          widget('divider', { lineStyle: 'solid' }, { size: 1, accentColor: GOLD, maxWidth: 80, textAlign: 'center' }),
          heading('An evening to remember', 'h1', { fontFamily: 'cormorant-garamond', fontSize: 52, fontWeight: 600, lineHeight: 1.05, color: '#f5efe3', textAlign: 'center' }, { fontSize: 40 }),
          text('Seasonal plates from the {store} kitchen.', { fontSize: 17, color: 'rgba(245,239,227,0.7)', textAlign: 'center', letterSpacing: 0.5 }),
          entry('tiles', { showBlurbs: false }, {
            accentColor: 'rgba(201,169,110,0.08)',
            accentTextColor: '#f5efe3',
            color: GOLD,
            radius: 2,
            fontSize: 13,
            letterSpacing: 2,
            textTransform: 'uppercase',
            margin: box(12, 0, 0, 0),
          }),
        ],
      },
    ],
  })
  return design([page], { headingFont: 'cormorant-garamond' })
}

const SKY = '#e0f2fe'
const NAVY = '#0c4a6e'

/** Delivery-first: the promise up front, choices as a list. */
export function buildDeliveryFirst(): HeroDesignV5 {
  const page = section({
    label: 'Welcome — delivery',
    widths: [55, 45],
    style: { fullHeight: true, verticalAlign: 'center', contentWidth: 1100, padding: box(64, 24), gap: 48, background: { type: 'color', color: SKY } },
    mobile: { padding: box(36, 18), gap: 24 },
    columns: [
      {
        style: { gap: 18, verticalAlign: 'center', color: NAVY },
        mobile: { textAlign: 'center' },
        widgets: [
          logo({ size: 56, textAlign: 'left', color: NAVY }, { textAlign: 'center' }),
          heading('Your favourites, at your door in 30 minutes', 'h1', { ...DISPLAY, fontSize: 52, color: NAVY }, { fontSize: 34 }),
          iconList(
            [listItem('Truck', 'Free delivery over ₱500'), listItem('ShieldCheck', 'Pay on delivery'), listItem('Clock', 'Open 10 AM – 10 PM')],
            'vertical',
            { fontSize: 16, color: NAVY, accentColor: '#0284c7' },
            { maxWidth: 300, align: 'center', textAlign: 'left' },
          ),
        ],
      },
      {
        style: { verticalAlign: 'center', padding: box(24), radius: 24, background: { type: 'color', color: '#ffffff' }, shadow: 'lg' },
        mobile: { padding: box(16) },
        widgets: [
          text('**How would you like it?**', { fontSize: 17, color: NAVY, margin: box(0, 0, 4, 0) }),
          entry('list', { blurbs: { delivery: 'Fastest way to eat', pickup: 'Ready when you arrive', dine_in: 'Join us at the shop' } }, {
            accentColor: '#f0f9ff',
            accentTextColor: NAVY,
            color: '#0284c7',
            radius: 14,
            gap: 10,
          }),
        ],
      },
    ],
  })
  return design([page])
}
