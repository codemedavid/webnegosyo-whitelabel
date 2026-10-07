// ---------------------------------------------------------------------------
// Hero Builder v5 — story-led starting designs, modelled on the layouts of
// well-regarded restaurant sites (structure only; copy and photos are ours):
// masthead + panorama, manifesto + three doors, asymmetric triptych, press
// quote, seasonal zig-zag. Registered in templates.ts.
// ---------------------------------------------------------------------------

import {
  LEAD_MOBILE,
  MENU_ANCHOR,
  PHOTOS,
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
  animate,
  type ColumnSpec,
} from './section-presets'
import type { HeroDesignV5, NodeStyle } from './types'

const EYEBROW: NodeStyle = { fontSize: 13, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase' }
const EYEBROW_MOBILE: NodeStyle = { fontSize: 12, letterSpacing: 2 }

// ── Masthead + panorama ────────────────────────────────────────────────────
// A huge lowercase wordmark over a wide, edge-to-edge photo band.

const BONE = '#f4efe6'
const INK = '#1c1a17'
const MOSS = '#4d5b3a'

export function buildMastheadPanorama(): HeroDesignV5 {
  const masthead = section({
    label: 'Hero — masthead',
    widths: [100],
    style: { padding: box(96, 24, 40, 24), color: INK, background: { type: 'color', color: BONE } },
    mobile: { padding: box(56, 20, 28, 20) },
    columns: [
      {
        style: { gap: 18, textAlign: 'center' },
        widgets: [
          text('Kitchen & wine bar · Since 2016', { ...EYEBROW, color: MOSS, textAlign: 'center' }, EYEBROW_MOBILE),
          animate(
            heading('kusina', 'h1', { fontFamily: 'cormorant-garamond', fontSize: 168, fontWeight: 500, lineHeight: 0.85, letterSpacing: -4, color: INK, textAlign: 'center' }, { fontSize: 84, letterSpacing: -2 }),
            'fade',
            0,
            1200,
          ),
          text('*Seasonal plates, natural wine and a long table for everyone.*', { fontFamily: 'lora', fontSize: 21, color: INK, textAlign: 'center' }, { fontSize: 17 }),
          buttons([button('Order now', MENU_ANCHOR, 'outline')], { textAlign: 'center', accentColor: INK, radius: 0, letterSpacing: 1, margin: box(6, 0, 0, 0) }),
        ],
      },
    ],
  })
  const panorama = section({
    label: 'Panorama photo',
    widths: [100],
    style: { padding: box(0, 24), contentWidth: 1400, background: { type: 'color', color: BONE } },
    mobile: { padding: box(0, 0) },
    columns: [
      {
        widgets: [
          animate(
            image(photo(PHOTOS.diningRoom, 2200), 'Our dining room, set for dinner', { radius: 0, aspectRatio: '21/9' }, { aspectRatio: '4/3' }),
            'fade',
            200,
            1200,
          ),
        ],
      },
    ],
  })
  const details = section({
    label: 'Address & hours',
    widths: [100],
    style: { padding: box(24, 24, 56, 24), contentWidth: 1400, background: { type: 'color', color: BONE } },
    mobile: { padding: box(20, 20, 40, 20) },
    columns: [
      {
        style: { gap: 18 },
        widgets: [
          widget('divider', {}, { size: 1, accentColor: 'rgba(28,26,23,0.25)', margin: box(0) }),
          iconList(
            [listItem('MapPin', 'Poblacion, Makati'), listItem('Clock', 'Tue–Sun · 11 AM – 10 PM'), listItem('Phone', '0917 123 4567')],
            'inline',
            { fontSize: 15, gap: 32, color: INK, accentColor: MOSS, textAlign: 'center' },
            { fontSize: 14, gap: 14 },
          ),
        ],
      },
    ],
  })
  return design([masthead, panorama, details])
}

// ── Manifesto + three doors ────────────────────────────────────────────────
// A long statement headline, then three photo "doors" into the store.

const SEPIA = '#f3e7d3'
const ESPRESSO = '#2a1d14'
const BRICK = '#8c2f1b'

function door(photoKey: keyof typeof PHOTOS, alt: string, label: string, cta: string): ColumnSpec {
  return {
    style: { gap: 12 },
    widgets: [
      image(photo(PHOTOS[photoKey], 900), alt, { radius: 4, aspectRatio: '4/3' }),
      heading(label, 'h3', { fontFamily: 'karla', fontSize: 15, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: ESPRESSO }, { fontSize: 14 }),
      buttons([button(cta, MENU_ANCHOR, 'ghost', 'ArrowRight')], { fontSize: 15, accentColor: BRICK, margin: box(-8, 0, 0, -16) }, {}),
    ],
  }
}

export function buildManifestoDoors(): HeroDesignV5 {
  const manifesto = section({
    label: 'Hero — manifesto',
    widths: [100],
    style: { minHeight: 520, verticalAlign: 'center', padding: box(104, 24, 56, 24), contentWidth: 1100, color: ESPRESSO, background: { type: 'color', color: SEPIA } },
    mobile: { minHeight: 0, padding: box(56, 20, 32, 20) },
    columns: [
      {
        style: { gap: 22 },
        widgets: [
          text('Our kitchen, since 1998', { ...EYEBROW, fontFamily: 'karla', color: BRICK }, EYEBROW_MOBILE),
          animate(
            heading('Cooked the way Lola taught us — *slowly*, *generously*, and always meant for sharing.', 'h1', { fontFamily: 'dm-serif-display', fontSize: 62, fontWeight: 400, lineHeight: 1.12, color: ESPRESSO, maxWidth: 980 }, { fontSize: 34 }),
            'slide-up',
          ),
          buttons([button('Order now', MENU_ANCHOR, 'solid', 'ShoppingBag'), button('View menu', MENU_ANCHOR, 'ghost', 'ArrowRight')], { accentColor: BRICK, radius: 2 }),
        ],
      },
    ],
  })
  const doors = section({
    label: 'Three doors',
    widths: [1, 1, 1],
    style: { padding: box(8, 24, 96, 24), gap: 24, contentWidth: 1100, background: { type: 'color', color: SEPIA } },
    mobile: { padding: box(8, 20, 56, 20), gap: 28 },
    columns: [
      door('plated', 'A plated dish from our dining room', 'Dine with us', 'View menu'),
      door('feast', 'A table of shared dishes', 'Delivery & pickup', 'Order now'),
      door('restaurantWarm', 'Our warmly lit dining room', 'Feasts for groups', 'Plan a feast'),
    ],
  })
  return design([manifesto, doors])
}

// ── Asymmetric triptych ────────────────────────────────────────────────────
// Copy, one tall photo and two stacked squares in uneven columns.

const IVORY = '#fbfaf7'

export function buildTriptych(): HeroDesignV5 {
  const hero = section({
    label: 'Hero — triptych',
    widths: [40, 32, 28],
    style: { padding: box(96, 24), gap: 20, align: 'center', contentWidth: 1280, background: { type: 'color', color: IVORY } },
    tablet: { gap: 14 },
    mobile: { padding: box(48, 16), gap: 20 },
    columns: [
      {
        style: { gap: 20, padding: box(0, 28, 0, 0) },
        mobile: { padding: box(0), textAlign: 'center', gap: 16 },
        widgets: [
          text('Hand-pulled · Cooked to order', { ...EYEBROW, color: '@primary' }, EYEBROW_MOBILE),
          animate(heading('Slow broth, fresh noodles, every single bowl', 'h1', { fontFamily: 'fraunces', fontSize: 54, fontWeight: 600, lineHeight: 1.05, letterSpacing: -1 }, { fontSize: 36 }), 'slide-up'),
          text('Twelve-hour broths, noodles pulled every morning and bright rice bowls from our open kitchen — for dine-in, pickup or delivery.', { fontSize: 18, lineHeight: 1.6 }, LEAD_MOBILE),
          buttons([button('Order now', MENU_ANCHOR, 'solid', 'ShoppingBag'), button('View menu', MENU_ANCHOR, 'outline')], { radius: 4 }),
        ],
      },
      {
        widgets: [animate(image(photo(PHOTOS.ramen, 1000), 'A steaming bowl of noodle soup', { radius: 8, aspectRatio: '3/4' }, { aspectRatio: '4/3' }), 'fade', 120)],
      },
      {
        widgets: [
          animate(
            widget(
              'gallery',
              { images: [galleryImage(photo(PHOTOS.bowl, 700), 'A fresh rice bowl'), galleryImage(photo(PHOTOS.riceBowl, 700), 'A colorful salad plate')] },
              { columns: 1, gap: 16, radius: 8, aspectRatio: '1/1' },
              { columns: 2, gap: 12 },
            ),
            'fade',
            240,
          ),
        ],
      },
    ],
  })
  return design([hero])
}

// ── Press quote ────────────────────────────────────────────────────────────
// One big italic review on a deep color, then a strip of photos.

const OXBLOOD = '#3b0d14'
const CREAM = '#f6eee3'
const GOLD = '#e0b44c'

export function buildPressQuote(): HeroDesignV5 {
  const quote = section({
    label: 'Hero — press quote',
    widths: [100],
    style: { padding: box(104, 24, 56, 24), contentWidth: 900, color: CREAM, background: { type: 'color', color: OXBLOOD } },
    mobile: { padding: box(64, 20, 36, 20) },
    columns: [
      {
        style: { gap: 22, textAlign: 'center' },
        widgets: [
          text('★★★★★', { fontSize: 22, letterSpacing: 6, color: GOLD, textAlign: 'center' }),
          animate(
            heading('“The kind of place you tell all your friends about — then quietly worry it will get too busy.”', 'p', { fontFamily: 'cormorant-garamond', fontSize: 50, fontWeight: 500, lineHeight: 1.15, italic: true, color: CREAM, textAlign: 'center' }, { fontSize: 30 }),
            'fade',
            100,
            1100,
          ),
          text('— A very happy regular', { fontFamily: 'montserrat', fontSize: 12, fontWeight: 600, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(246,238,227,0.7)', textAlign: 'center' }, { fontSize: 11 }),
          widget('divider', {}, { size: 1, accentColor: GOLD, maxWidth: 64, textAlign: 'center', margin: box(4, 0) }),
          buttons([button('Order now', MENU_ANCHOR, 'solid'), button('View menu', MENU_ANCHOR, 'outline')], {
            textAlign: 'center',
            accentColor: CREAM,
            accentTextColor: OXBLOOD,
            radius: 999,
          }),
        ],
      },
    ],
  })
  const photos = section({
    label: 'Photo strip',
    widths: [100],
    style: { padding: box(0, 24, 88, 24), background: { type: 'color', color: OXBLOOD } },
    mobile: { padding: box(0, 16, 48, 16) },
    columns: [
      {
        widgets: [
          widget(
            'gallery',
            {
              images: [
                galleryImage(photo(PHOTOS.plated, 800), 'A plated main course'),
                galleryImage(photo(PHOTOS.diningRoom, 800), 'Dinner service in the dining room'),
                galleryImage(photo(PHOTOS.salad, 800), 'A bright salad bowl'),
              ],
            },
            { columns: 3, gap: 16, radius: 4, aspectRatio: '1/1' },
            { columns: 3, gap: 8 },
          ),
        ],
      },
    ],
  })
  return design([quote, photos])
}

// ── Seasonal zig-zag ───────────────────────────────────────────────────────
// Two featured items, photo and copy swapping sides on alternating tints.

const FLOUR = '#faf7f2'
const OAT = '#efe4d2'
const CRUST = '#3d2b1f'

interface SeasonalItem {
  label: string
  photoKey: keyof typeof PHOTOS
  alt: string
  title: string
  body: string
  price: string
}

function seasonalCopy(item: SeasonalItem): ColumnSpec {
  return {
    style: { gap: 16, verticalAlign: 'center', padding: box(0, 16) },
    mobile: { padding: box(0), textAlign: 'center', gap: 12 },
    widgets: [
      text(item.label, { ...EYEBROW, fontFamily: 'archivo', color: '@primary' }, EYEBROW_MOBILE),
      heading(item.title, 'h2', { fontFamily: 'archivo', fontSize: 42, fontWeight: 900, lineHeight: 1.02, textTransform: 'uppercase', color: CRUST }, { fontSize: 30 }),
      text(item.body, { fontFamily: 'lora', fontSize: 18, lineHeight: 1.65, color: 'rgba(61,43,31,0.8)' }, { fontSize: 16 }),
      badge(item.price, 'Tag', { color: CRUST, accentColor: '@primary', background: { type: 'color', color: '#ffffff' } }),
      buttons([button('Order now', MENU_ANCHOR, 'ghost', 'ArrowRight')], { fontSize: 15, accentColor: CRUST, margin: box(0, 0, 0, -16) }, { margin: box(0), textAlign: 'center' }),
    ],
  }
}

function seasonalPhoto(item: SeasonalItem): ColumnSpec {
  return { widgets: [animate(image(photo(PHOTOS[item.photoKey], 1400), item.alt, { radius: 0, aspectRatio: '4/3' }), 'fade', 100)] }
}

const SEASONAL: readonly [SeasonalItem, SeasonalItem] = [
  {
    label: 'New this season',
    photoKey: 'croissants',
    alt: 'Golden calamansi butter croissants',
    title: 'Calamansi butter croissant',
    body: 'Seventy-two layers of butter folded with bright calamansi zest. Baked every morning, gone by lunch.',
    price: '₱165 · Limited batch',
  },
  {
    label: 'Back by demand',
    photoKey: 'coffeeBar',
    alt: 'A barista pouring a latte',
    title: 'Brown-sugar oat latte',
    body: 'Double ristretto, oat milk and muscovado syrup we cook in-house. Hot or iced, all season long.',
    price: '₱185 · Hot or iced',
  },
]

export function buildSeasonalZigzag(): HeroDesignV5 {
  const [first, second] = SEASONAL
  const featureOne = section({
    label: 'Hero — seasonal feature',
    widths: [55, 45],
    style: { padding: box(88, 24), gap: 56, color: CRUST, background: { type: 'color', color: FLOUR } },
    mobile: { padding: box(40, 16), gap: 24 },
    columns: [seasonalPhoto(first), seasonalCopy(first)],
  })
  // Copy left, photo right — reversed on phones so every feature leads with its photo.
  const featureTwo = section({
    label: 'Seasonal feature — mirrored',
    widths: [45, 55],
    style: { padding: box(88, 24), gap: 56, color: CRUST, background: { type: 'color', color: OAT } },
    mobile: { padding: box(40, 16), gap: 24, reverse: true },
    columns: [seasonalCopy(second), seasonalPhoto(second)],
  })
  return design([featureOne, featureTwo])
}
