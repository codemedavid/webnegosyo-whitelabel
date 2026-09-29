// ---------------------------------------------------------------------------
// Hero Builder v5 — full starting designs for a storefront hero. Each build()
// returns a fresh design (fresh ids every call) made only from the defaults.ts
// factories via the kit in section-presets.ts.
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
  buildFeatures,
  buildHeroCentered,
  buildHeroSplit,
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
import type { HeroDesignV5, NodeStyle, Section, Widget } from './types'

export { SECTION_PRESETS } from './section-presets'
export type { SectionPreset } from './section-presets'

export interface HeroTemplate {
  id: string
  name: string
  description: string
  category: 'restaurant' | 'cafe' | 'promo' | 'minimal'
  build: () => HeroDesignV5
}

const POSTER_INK = '#0f0f0f'
const VIDEO_URL = 'https://videos.pexels.com/video-files/3195394/3195394-uhd_2560_1440_25fps.mp4'

/** Light-on-photo buttons: white solid + white outline. */
function photoButtons(): NodeStyle {
  return { textAlign: 'center', accentColor: WHITE, accentTextColor: POSTER_INK, margin: box(8, 0, 0, 0) }
}

/** Centered white hero copy for photo / video backgrounds. */
function photoHeroCopy(kicker: string, title: string, body: string): Widget[] {
  return [
    animate(badge(kicker, 'Star', { color: WHITE, accentColor: '#fbbf24', background: { type: 'color', color: WHITE_GLASS } }), 'fade'),
    animate(
      heading(title, 'h1', { ...DISPLAY, fontSize: 68, color: WHITE, maxWidth: 900, textAlign: 'center' }, { fontSize: 38 }),
      'slide-up',
      100,
    ),
    animate(text(body, { ...LEAD, fontSize: 20, color: WHITE_SOFT, maxWidth: 640, textAlign: 'center' }, LEAD_MOBILE), 'slide-up', 200),
    animate(
      buttons([button('Order now', MENU_ANCHOR, 'solid', 'ShoppingBag'), button('View menu', MENU_ANCHOR, 'outline')], photoButtons()),
      'slide-up',
      300,
    ),
  ]
}

function buildFullBleedPhoto(): HeroDesignV5 {
  const hero = section({
    label: 'Hero — full-bleed photo',
    widths: [100],
    style: {
      fullHeight: true,
      verticalAlign: 'center',
      padding: box(120, 24),
      background: {
        type: 'image',
        color: '#1c1917',
        image: { url: photo(PHOTOS.restaurantWarm, 2000), size: 'cover', position: 'center' },
        overlay: darkOverlay(50),
      },
    },
    mobile: { padding: box(96, 16, 72, 16) },
    columns: [
      {
        style: { gap: 22, textAlign: 'center' },
        widgets: [
          ...photoHeroCopy(
            'Rated 4.9 by our regulars',
            'A taste of home in every plate',
            'Classic Filipino comfort food, made the slow way. Order now for pickup or delivery around the city.',
          ),
          iconList(
            [listItem('Clock', 'Open daily 10 AM – 10 PM'), listItem('Truck', 'Free delivery over ₱500'), listItem('ShieldCheck', 'Pay on delivery')],
            'inline',
            { fontSize: 14, color: WHITE_SOFT, accentColor: WHITE, textAlign: 'center', margin: box(20, 0, 0, 0) },
            { fontSize: 13 },
          ),
        ],
      },
    ],
  })
  return design([hero])
}

function buildVideoHero(): HeroDesignV5 {
  const hero = section({
    label: 'Hero — video',
    widths: [100],
    style: {
      minHeight: 680,
      verticalAlign: 'center',
      padding: box(120, 24),
      background: { type: 'video', videoUrl: VIDEO_URL, overlay: darkOverlay(55) },
    },
    // Phones get a still photo instead of downloading the video.
    mobile: {
      minHeight: 560,
      padding: box(88, 16),
      background: {
        type: 'image',
        color: '#1c1917',
        image: { url: photo(PHOTOS.plated, 1000), size: 'cover', position: 'center' },
        overlay: darkOverlay(55),
      },
    },
    columns: [
      {
        style: { gap: 22, textAlign: 'center' },
        widgets: photoHeroCopy(
          'Cooked fresh, every order',
          'From our wok to your table in 30 minutes',
          'Watch it sizzle, then have it delivered hot. Real ingredients, generous servings, fair prices.',
        ),
      },
    ],
  })
  return design([hero])
}

function buildPromoCountdown(): HeroDesignV5 {
  const hero = section({
    label: 'Promo — countdown',
    widths: [56, 44],
    style: {
      padding: box(88, 24),
      gap: 48,
      color: WHITE,
      background: { type: 'gradient', gradient: { kind: 'linear', from: '@primary', to: '@accent', angle: 135 } },
    },
    mobile: { padding: box(44, 16), gap: 28 },
    columns: [
      {
        style: { gap: 20 },
        mobile: { textAlign: 'center', gap: 16 },
        widgets: [
          badge('Weekend deal · Ends soon', 'Percent', { color: WHITE, accentColor: WHITE, background: { type: 'color', color: WHITE_GLASS } }),
          animate(heading('Salo-salo sale: 20% off all party trays', 'h1', { ...DISPLAY, fontSize: 56, color: WHITE }, DISPLAY_MOBILE), 'slide-up'),
          text('Pancit, lumpia, lechon kawali and more — enough for the whole barkada. Order before the timer runs out.', { ...LEAD, color: WHITE_SOFT }, LEAD_MOBILE),
          widget('countdown', {}, { fontSize: 22, gap: 10, accentColor: WHITE_GLASS, accentTextColor: WHITE }, { fontSize: 17, textAlign: 'center' }),
          buttons([button('Grab the deal', MENU_ANCHOR, 'solid', 'Gift'), button('See all trays', MENU_ANCHOR, 'ghost')], {
            accentColor: WHITE,
            accentTextColor: '@primary',
            margin: box(8, 0, 0, 0),
          }),
        ],
      },
      {
        widgets: [
          animate(
            image(photo(PHOTOS.feast), 'Party trays of Filipino favorites', { radius: 28, aspectRatio: '1/1', shadow: 'xl' }, { radius: 20, aspectRatio: '4/3' }),
            'zoom',
            150,
          ),
        ],
      },
    ],
  })
  return design([hero])
}

function buildCafeMinimal(): HeroDesignV5 {
  const serif: NodeStyle = { fontFamily: 'playfair-display', fontWeight: 500, fontSize: 66, lineHeight: 1.08, letterSpacing: -1 }
  const hero = section({
    label: 'Hero — café minimal',
    widths: [55, 45],
    style: { padding: box(128, 24), gap: 72, contentWidth: 1080, background: { type: 'color', color: '@background' } },
    tablet: { padding: box(88, 24), gap: 40 },
    mobile: { padding: box(56, 20), gap: 36 },
    columns: [
      {
        style: { gap: 24 },
        mobile: { textAlign: 'center', gap: 18 },
        widgets: [
          text('Est. 2019 · Maginhawa, Quezon City', { fontSize: 13, fontWeight: 600, letterSpacing: 3, textTransform: 'uppercase', color: '@primary' }, { fontSize: 12, letterSpacing: 2 }),
          animate(heading('Slow coffee, warm bread, good mornings.', 'h1', serif, { fontSize: 38, letterSpacing: -0.5 }), 'fade', 80),
          text('A small neighborhood café pouring local beans and baking every morning. Order ahead and skip the line.', { ...LEAD, maxWidth: 480 }, LEAD_MOBILE),
          iconList(
            [
              listItem('Coffee', 'Benguet & Sagada single-origin beans'),
              listItem('Croissant', 'Pastries baked fresh at 6 AM'),
              listItem('Leaf', 'Oat & soy milk at no extra cost'),
            ],
            'vertical',
            { fontSize: 16, gap: 12, color: '@text', accentColor: '@primary', margin: box(4, 0, 8, 0) },
            { fontSize: 15, textAlign: 'left' },
          ),
          buttons([button('Order ahead', MENU_ANCHOR, 'solid', 'Coffee'), button('See the menu', MENU_ANCHOR, 'ghost', 'ArrowRight')], { radius: 999 }),
        ],
      },
      {
        widgets: [
          image(photo(PHOTOS.coffeeCup), 'A freshly poured cup of coffee', { radius: 6, aspectRatio: '3/4' }, { radius: 6, aspectRatio: '4/3' }),
        ],
      },
    ],
  })
  return design([hero])
}

function buildBoldPoster(): HeroDesignV5 {
  const hero = section({
    label: 'Hero — bold poster',
    widths: [58, 42],
    style: { padding: box(96, 24), gap: 48, color: WHITE, background: { type: 'color', color: POSTER_INK } },
    mobile: { padding: box(48, 16), gap: 28 },
    columns: [
      {
        style: { gap: 20 },
        mobile: { textAlign: 'center', gap: 16 },
        widgets: [
          badge('New · Spicy sisig burger', 'Flame', { color: POSTER_INK, accentColor: POSTER_INK, background: { type: 'color', color: '@accent' } }),
          animate(
            heading('Loud flavor. No apologies.', 'h1', { fontFamily: 'anton', fontSize: 112, fontWeight: 400, lineHeight: 0.92, textTransform: 'uppercase', color: WHITE }, { fontSize: 60 }),
            'slide-right',
          ),
          text('Smash burgers, crispy sisig and loaded fries — built big, cooked fast, made for sharing (or not).', { ...LEAD, color: 'rgba(255,255,255,0.72)', maxWidth: 520 }, LEAD_MOBILE),
          buttons([button('Order now', MENU_ANCHOR, 'solid', 'Flame'), button('View menu', MENU_ANCHOR, 'outline')], {
            fontSize: 17,
            accentColor: '@accent',
            accentTextColor: POSTER_INK,
            radius: 4,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }),
        ],
      },
      {
        widgets: [
          animate(
            image(photo(PHOTOS.burger), 'A stacked smash burger', { radius: 4, aspectRatio: '1/1', borderWidth: 6, borderColor: '@accent' }, { aspectRatio: '4/3', borderWidth: 4 }),
            'zoom',
            150,
          ),
        ],
      },
    ],
  })
  const strip = section({
    label: 'Poster strip',
    widths: [100],
    style: { padding: box(18, 24), background: { type: 'color', color: '@accent' } },
    mobile: { padding: box(14, 16) },
    columns: [
      {
        widgets: [
          iconList(
            [listItem('Flame', 'Smash burgers'), listItem('Flame', 'Crispy sisig'), listItem('Flame', 'Loaded fries'), listItem('Flame', 'Ice-cold drinks')],
            'inline',
            { fontFamily: 'bebas-neue', fontSize: 28, letterSpacing: 1.5, color: POSTER_INK, accentColor: POSTER_INK, textAlign: 'center', gap: 32 },
            { fontSize: 20, gap: 16 },
          ),
        ],
      },
    ],
  })
  return design([hero, strip])
}

function buildSplitPhoto(): HeroDesignV5 {
  return design([buildHeroSplit()])
}

function buildFeaturesStrip(): HeroDesignV5 {
  const hero: Section = buildHeroCentered()
  const features: Section = buildFeatures()
  return design([hero, { ...features, style: { ...features.style, padding: box(8, 24, 80, 24) } }])
}

export const HERO_TEMPLATES: readonly HeroTemplate[] = [
  {
    id: 'split-photo',
    name: 'Split with photo',
    description: 'Headline, pitch and two order buttons beside a big food photo. A proven all-rounder.',
    category: 'restaurant',
    build: buildSplitPhoto,
  },
  {
    id: 'full-bleed-photo',
    name: 'Full-screen photo',
    description: 'Your best photo fills the screen under a dark tint, with centered white copy and buttons.',
    category: 'restaurant',
    build: buildFullBleedPhoto,
  },
  {
    id: 'video-hero',
    name: 'Video background',
    description: 'A looping kitchen video behind centered copy; phones get a still photo to save data.',
    category: 'restaurant',
    build: buildVideoHero,
  },
  {
    id: 'promo-countdown',
    name: 'Promo countdown',
    description: 'Brand-gradient sale band with a live countdown, deal copy and a party-tray photo.',
    category: 'promo',
    build: buildPromoCountdown,
  },
  {
    id: 'cafe-minimal',
    name: 'Café minimal',
    description: 'Serif headline, generous whitespace and a short list of highlights — calm and premium.',
    category: 'cafe',
    build: buildCafeMinimal,
  },
  {
    id: 'bold-poster',
    name: 'Bold poster',
    description: 'Huge condensed type on black with accent-colored buttons and a menu ticker strip.',
    category: 'promo',
    build: buildBoldPoster,
  },
  {
    id: 'features-strip',
    name: 'Hero + features',
    description: 'Centered headline followed by three icon cards on why customers should order from you.',
    category: 'minimal',
    build: buildFeaturesStrip,
  },
]
