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
  highlightList,
  iconList,
  image,
  listItem,
  photo,
  section,
  text,
  widget,
} from './section-presets'
import { buildLimitedDrop, buildLocationIndex, buildOrderWays, buildStoriesStack, buildTwoPaths } from './templates-commerce'
import { buildCardOnPhoto, buildChalkboard, buildFineDining, buildLateNightNeon } from './templates-dark'
import { buildBakery, buildBigNumbers, buildEditorial, buildFreshHealthy, buildHowItWorks, buildPhotoMosaic } from './templates-light'
import { buildManifestoDoors, buildMastheadPanorama, buildPressQuote, buildSeasonalZigzag, buildTriptych } from './templates-story'
import { photoAt, type TemplateCopy } from './template-copy'
import type { HeroDesignV5, NodeStyle, Section, Widget } from './types'

export { SECTION_PRESETS } from './section-presets'
export type { SectionPreset } from './section-presets'

/** Gallery filter order. */
export const HERO_TEMPLATE_CATEGORIES = ['restaurant', 'cafe', 'promo', 'minimal'] as const
export type HeroTemplateCategory = (typeof HERO_TEMPLATE_CATEGORIES)[number]

export interface HeroTemplate {
  id: string
  name: string
  description: string
  category: HeroTemplateCategory
  build: () => HeroDesignV5
}

const POSTER_INK = '#0f0f0f'
const VIDEO_URL = 'https://videos.pexels.com/video-files/3195394/3195394-uhd_2560_1440_25fps.mp4'

/** Light-on-photo buttons: white solid + white outline. */
function photoButtons(): NodeStyle {
  return { textAlign: 'center', accentColor: WHITE, accentTextColor: POSTER_INK, margin: box(8, 0, 0, 0) }
}

/** Centered white hero copy for photo / video backgrounds. */
function photoHeroCopy(kicker: string, title: string, body: string, ctas: readonly [string, string] = ['Order now', 'View menu']): Widget[] {
  return [
    animate(badge(kicker, 'Star', { color: WHITE, accentColor: '#fbbf24', background: { type: 'color', color: WHITE_GLASS } }), 'fade'),
    animate(
      heading(title, 'h1', { ...DISPLAY, fontSize: 68, color: WHITE, maxWidth: 900, textAlign: 'center' }, { fontSize: 38 }),
      'slide-up',
      100,
    ),
    animate(text(body, { ...LEAD, fontSize: 20, color: WHITE_SOFT, maxWidth: 640, textAlign: 'center' }, LEAD_MOBILE), 'slide-up', 200),
    animate(
      buttons([button(ctas[0], MENU_ANCHOR, 'solid', 'ShoppingBag'), button(ctas[1], MENU_ANCHOR, 'outline')], photoButtons()),
      'slide-up',
      300,
    ),
  ]
}

export const FULL_BLEED_SAMPLE: TemplateCopy = {
  kicker: 'Rated 4.9 by our regulars',
  headline: 'A taste of home in every plate',
  body: 'Classic Filipino comfort food, made the slow way. Order now for pickup or delivery around the city.',
  highlights: [
    { icon: 'Clock', label: 'Open daily 10 AM – 10 PM' },
    { icon: 'Truck', label: 'Free delivery over ₱500' },
    { icon: 'ShieldCheck', label: 'Pay on delivery' },
  ],
  primaryCta: 'Order now',
  secondaryCta: 'View menu',
  photos: [{ url: photo(PHOTOS.restaurantWarm, 2000), alt: '' }],
}

/** Uses one photo, as the background. */
export function buildFullBleedPhoto(copy: TemplateCopy = FULL_BLEED_SAMPLE): HeroDesignV5 {
  const backdrop = photoAt(copy, FULL_BLEED_SAMPLE, 0)
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
        image: { url: backdrop.url, size: 'cover', position: 'center' },
        overlay: darkOverlay(50),
      },
    },
    mobile: { padding: box(96, 16, 72, 16) },
    columns: [
      {
        style: { gap: 22, textAlign: 'center' },
        widgets: [
          ...photoHeroCopy(copy.kicker, copy.headline, copy.body, [copy.primaryCta, copy.secondaryCta]),
          ...highlightList(
            copy.highlights,
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

export const CAFE_MINIMAL_SAMPLE: TemplateCopy = {
  kicker: 'Est. 2019 · Maginhawa, Quezon City',
  headline: 'Slow coffee, warm bread, good mornings.',
  body: 'A small neighborhood café pouring local beans and baking every morning. Order ahead and skip the line.',
  highlights: [
    { icon: 'Coffee', label: 'Benguet & Sagada single-origin beans' },
    { icon: 'Croissant', label: 'Pastries baked fresh at 6 AM' },
    { icon: 'Leaf', label: 'Oat & soy milk at no extra cost' },
  ],
  primaryCta: 'Order ahead',
  secondaryCta: 'See the menu',
  photos: [{ url: photo(PHOTOS.coffeeCup), alt: 'A freshly poured cup of coffee' }],
}

/** Uses one portrait photo. */
export function buildCafeMinimal(copy: TemplateCopy = CAFE_MINIMAL_SAMPLE): HeroDesignV5 {
  const serif: NodeStyle = { fontFamily: 'playfair-display', fontWeight: 500, fontSize: 66, lineHeight: 1.08, letterSpacing: -1 }
  const picture = photoAt(copy, CAFE_MINIMAL_SAMPLE, 0)
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
          text(copy.kicker, { fontSize: 13, fontWeight: 600, letterSpacing: 3, textTransform: 'uppercase', color: '@primary' }, { fontSize: 12, letterSpacing: 2 }),
          animate(heading(copy.headline, 'h1', serif, { fontSize: 38, letterSpacing: -0.5 }), 'fade', 80),
          text(copy.body, { ...LEAD, maxWidth: 480 }, LEAD_MOBILE),
          ...highlightList(
            copy.highlights,
            'vertical',
            { fontSize: 16, gap: 12, color: '@text', accentColor: '@primary', margin: box(4, 0, 8, 0) },
            { fontSize: 15, textAlign: 'left' },
          ),
          buttons([button(copy.primaryCta, MENU_ANCHOR, 'solid', 'Coffee'), button(copy.secondaryCta, MENU_ANCHOR, 'ghost', 'ArrowRight')], { radius: 999 }),
        ],
      },
      {
        widgets: [
          image(picture.url, picture.alt, { radius: 6, aspectRatio: '3/4' }, { radius: 6, aspectRatio: '4/3' }),
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

export function buildSplitPhoto(copy?: TemplateCopy): HeroDesignV5 {
  return design([buildHeroSplit(copy)])
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
    build: () => buildSplitPhoto(),
  },
  {
    id: 'full-bleed-photo',
    name: 'Full-screen photo',
    description: 'Your best photo fills the screen under a dark tint, with centered white copy and buttons.',
    category: 'restaurant',
    build: () => buildFullBleedPhoto(),
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
    build: () => buildCafeMinimal(),
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
  {
    id: 'editorial',
    name: 'Editorial',
    description: 'Magazine-style serif headline, a tall photo with a caption and three big numbers underneath.',
    category: 'restaurant',
    build: buildEditorial,
  },
  {
    id: 'card-on-photo',
    name: 'Card on photo',
    description: 'Your dining room fills the screen with the pitch on a floating card; phones show the photo above it.',
    category: 'restaurant',
    build: () => buildCardOnPhoto(),
  },
  {
    id: 'photo-mosaic',
    name: 'Photo mosaic',
    description: 'Four dishes in a tidy photo grid beside the headline — shows off a varied menu at a glance.',
    category: 'restaurant',
    build: buildPhotoMosaic,
  },
  {
    id: 'fine-dining',
    name: 'Fine dining',
    description: 'Full-screen dining-room photo, elegant serif type and gold details for an upscale feel.',
    category: 'restaurant',
    build: () => buildFineDining(),
  },
  {
    id: 'chalkboard',
    name: 'Chalkboard specials',
    description: 'Hand-lettered specials board with prices, a framed photo and chalk-yellow buttons.',
    category: 'restaurant',
    build: () => buildChalkboard(),
  },
  {
    id: 'bakery',
    name: 'Bakery',
    description: 'Warm cream background, script greeting and a round framed photo of fresh bakes.',
    category: 'cafe',
    build: () => buildBakery(),
  },
  {
    id: 'fresh-healthy',
    name: 'Fresh & healthy',
    description: 'Soft green glow, a big salad photo and quick highlights for bowls, salads and juices.',
    category: 'cafe',
    build: buildFreshHealthy,
  },
  {
    id: 'late-night-neon',
    name: 'Late-night neon',
    description: 'Dark purple glow, giant condensed type and neon pink and cyan accents for after-hours stores.',
    category: 'promo',
    build: buildLateNightNeon,
  },
  {
    id: 'how-it-works',
    name: 'How it works',
    description: 'Brand-gradient hero with one order button, then three numbered steps from cart to doorstep.',
    category: 'promo',
    build: () => buildHowItWorks(),
  },
  {
    id: 'big-numbers',
    name: 'Big numbers',
    description: 'Centered headline followed by four stat tiles — rating, customers, delivery time, years open.',
    category: 'minimal',
    build: buildBigNumbers,
  },
  {
    id: 'masthead-panorama',
    name: 'Masthead + panorama',
    description: 'Your name set huge in lowercase serif, a wide edge-to-edge photo band, then address and hours.',
    category: 'restaurant',
    build: () => buildMastheadPanorama(),
  },
  {
    id: 'manifesto-doors',
    name: 'Manifesto + three doors',
    description: 'A long statement headline in warm sepia, then three photo cards leading to dine-in, delivery and groups.',
    category: 'restaurant',
    build: buildManifestoDoors,
  },
  {
    id: 'triptych',
    name: 'Asymmetric triptych',
    description: 'Copy, one tall photo and two stacked squares in uneven columns — clean and gallery-like.',
    category: 'restaurant',
    build: buildTriptych,
  },
  {
    id: 'press-quote',
    name: 'Press quote',
    description: 'One glowing review in big italic serif on deep oxblood, with a strip of three photos below.',
    category: 'restaurant',
    build: () => buildPressQuote(),
  },
  {
    id: 'location-index',
    name: 'Location index',
    description: 'Every branch named up top, then a card per branch with photo, hours and directions.',
    category: 'restaurant',
    build: buildLocationIndex,
  },
  {
    id: 'seasonal-zigzag',
    name: 'Seasonal zig-zag',
    description: 'Two featured items with photo and copy swapping sides on alternating warm tints.',
    category: 'cafe',
    build: buildSeasonalZigzag,
  },
  {
    id: 'stories-stack',
    name: 'Stories stack',
    description: 'Three photo panels in a row, each with its own news, tag and button — like a front page.',
    category: 'promo',
    build: buildStoriesStack,
  },
  {
    id: 'limited-drop',
    name: 'Limited-time drop',
    description: 'Full brand-color launch for one new item, with a promo-code pill and a fine-print strip.',
    category: 'promo',
    build: buildLimitedDrop,
  },
  {
    id: 'two-paths',
    name: 'Two paths',
    description: 'For groups and catering: two side-by-side offer cards with checklists and their own buttons.',
    category: 'promo',
    build: buildTwoPaths,
  },
  {
    id: 'order-ways',
    name: 'Order-ways hub',
    description: 'A short photo banner with four cards overlapping its edge: dine in, delivery, pickup, catering.',
    category: 'minimal',
    build: buildOrderWays,
  },
]
