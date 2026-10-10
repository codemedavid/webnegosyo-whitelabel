// ---------------------------------------------------------------------------
// Hero Builder v5 — single-section blocks a merchant can drop into a design,
// plus the small builder kit the full templates (templates.ts) share.
//
// Every node is produced by the defaults.ts factories and then overridden with
// spreads, so each build() returns a brand-new tree with fresh ids. Colors use
// theme refs (@primary, @text, …) so a preset adopts the store's branding;
// explicit colors appear only where the design needs them (text over photos).
// ---------------------------------------------------------------------------

import { createBlankDesign, createSection, createWidget, newId } from './defaults'
import { photoAt, type TemplateCopy, type TemplateHighlight } from './template-copy'
import type {
  AnimationType,
  Box,
  ButtonItem,
  GalleryImage,
  HeroDesignV5,
  IconListItem,
  NodeStyle,
  Section,
  Theme,
  Widget,
  WidgetContent,
  WidgetKind,
} from './types'

// ── Kit ────────────────────────────────────────────────────────────────────

/** The storefront's menu anchor — every "Order now" / "View menu" lands here. */
export const MENU_ANCHOR = '#storefront-menu'
export const WHITE = '#ffffff'
export const WHITE_SOFT = 'rgba(255,255,255,0.86)'
export const WHITE_GLASS = 'rgba(255,255,255,0.16)'

export const PHOTOS = {
  feast: '1504674900247-0877df9cc836',
  diningRoom: '1414235077428-338989a2e8c0',
  restaurant: '1517248135467-4c7edcad34c4',
  restaurantWarm: '1555396273-367ea4eb4db5',
  coffeeCup: '1495474472287-4d71bcdd2085',
  coffeeBar: '1509042239860-f550ce710b93',
  bowl: '1546069901-ba9599a7e63c',
  pizza: '1565299624946-b28f40a0ae38',
  burger: '1568901346375-23c9450c58cd',
  salad: '1512621776951-a57141f2eefd',
  riceBowl: '1540189549336-e6e99c3679fe',
  pancakes: '1567620905732-2d1ec7ab7445',
  bread: '1509440159596-0249088772ff',
  croissants: '1555507036-ab1f4038808a',
  ramen: '1569718212165-3a8278d5f624',
  plated: '1476224203421-9ac39bcb3327',
} as const

export function photo(id: string, width = 1600): string {
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${width}&q=80`
}

export function box(top: number, right = top, bottom = top, left = right): Box {
  return { top, right, bottom, left }
}

export function darkOverlay(opacity = 45): { color: string; opacity: number } {
  return { color: '#000000', opacity }
}

/** Typography scales (desktop / mobile pairs). */
export const DISPLAY: NodeStyle = { fontSize: 58, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1 }
export const DISPLAY_MOBILE: NodeStyle = { fontSize: 36, letterSpacing: -0.5 }
export const TITLE: NodeStyle = { fontSize: 40, fontWeight: 700, lineHeight: 1.15, letterSpacing: -0.5 }
export const TITLE_MOBILE: NodeStyle = { fontSize: 28 }
export const LEAD: NodeStyle = { fontSize: 19, lineHeight: 1.6 }
export const LEAD_MOBILE: NodeStyle = { fontSize: 16 }
/** Full-width, centred, thumb-sized buttons on phones. */
export const STRETCH_MOBILE: NodeStyle = { align: 'stretch', textAlign: 'center' }

type ContentOf<K extends WidgetKind> = Extract<WidgetContent, { kind: K }>
type ContentPatch<K extends WidgetKind> = Partial<Omit<ContentOf<K>, 'kind'>>

/** A factory widget with content / desktop / mobile overrides layered on top. */
export function widget<K extends WidgetKind>(
  kind: K,
  content: ContentPatch<K> = {},
  style: NodeStyle = {},
  mobile?: NodeStyle,
): Widget {
  const base = createWidget(kind)
  const mergedMobile = base.mobile || mobile ? { ...base.mobile, ...mobile } : undefined
  return {
    ...base,
    content: { ...base.content, ...content } as WidgetContent,
    style: { ...base.style, ...style },
    ...(mergedMobile ? { mobile: mergedMobile } : {}),
  }
}

export function animate(w: Widget, type: AnimationType, delay = 0, duration = 700): Widget {
  return { ...w, animation: { type, delay, duration } }
}

export function heading(text: string, tag: ContentOf<'heading'>['tag'], style: NodeStyle = {}, mobile?: NodeStyle): Widget {
  return widget('heading', { text, tag }, style, mobile)
}

export function text(value: string, style: NodeStyle = {}, mobile?: NodeStyle): Widget {
  return widget('text', { text: value }, style, mobile)
}

export function badge(value: string, icon: string, style: NodeStyle = {}): Widget {
  return widget('badge', { text: value, icon }, style)
}

export function button(label: string, href = MENU_ANCHOR, variant: ButtonItem['variant'] = 'solid', icon?: string): ButtonItem {
  const isExternal = href.startsWith('http')
  return { id: newId(), label, href, newTab: isExternal, variant, ...(icon ? { icon } : {}) }
}

export function buttons(items: ButtonItem[], style: NodeStyle = {}, mobile: NodeStyle = STRETCH_MOBILE): Widget {
  return widget('buttons', { items }, { fontSize: 16, gap: 12, ...style }, mobile)
}

export function listItem(icon: string, value: string): IconListItem {
  return { id: newId(), icon, text: value }
}

export function iconList(
  items: IconListItem[],
  layout: 'vertical' | 'inline',
  style: NodeStyle = {},
  mobile?: NodeStyle,
): Widget {
  return widget('icon-list', { items, layout }, style, mobile)
}

/** An icon list of the copy's highlights; none when there are none. */
export function highlightList(
  highlights: readonly TemplateHighlight[],
  layout: 'vertical' | 'inline',
  style: NodeStyle = {},
  mobile?: NodeStyle,
): Widget[] {
  if (highlights.length === 0) return []
  return [iconList(highlights.map((item) => listItem(item.icon, item.label)), layout, style, mobile)]
}

export function image(src: string, alt: string, style: NodeStyle = {}, mobile?: NodeStyle): Widget {
  return widget('image', { src, alt }, style, mobile)
}

export function galleryImage(src: string, alt: string): GalleryImage {
  return { id: newId(), src, alt }
}

export interface ColumnSpec {
  widgets: Widget[]
  style?: NodeStyle
  tablet?: NodeStyle
  mobile?: NodeStyle
}

export interface SectionSpec {
  label: string
  widths: readonly number[]
  style?: NodeStyle
  tablet?: NodeStyle
  mobile?: NodeStyle
  columns: readonly ColumnSpec[]
}

/** A factory section whose columns are filled from `spec.columns` (by index). */
export function section(spec: SectionSpec): Section {
  const base = createSection(spec.widths, spec.label)
  return {
    ...base,
    style: { ...base.style, ...spec.style },
    tablet: { ...base.tablet, ...spec.tablet },
    mobile: { ...base.mobile, ...spec.mobile },
    columns: base.columns.map((column, index) => {
      const col = spec.columns[index]
      if (!col) return column
      return {
        ...column,
        style: { ...column.style, ...col.style },
        ...(col.tablet ? { tablet: { ...col.tablet } } : {}),
        ...(col.mobile ? { mobile: { ...col.mobile } } : {}),
        widgets: col.widgets,
      }
    }),
  }
}

export function design(sections: Section[], theme: Partial<Theme> = {}): HeroDesignV5 {
  const blank = createBlankDesign()
  return { ...blank, theme: { ...blank.theme, ...theme }, sections }
}

const CENTER_MOBILE: NodeStyle = { textAlign: 'center' }

// ── Presets ────────────────────────────────────────────────────────────────

export const HERO_SPLIT_SAMPLE: TemplateCopy = {
  kicker: 'Now taking orders',
  headline: 'Home-style Filipino favorites, cooked fresh daily',
  body: 'From sizzling sisig to slow-braised adobo — order in a few taps for pickup or delivery.',
  highlights: [{ icon: 'Star', label: '4.9 from 1,200+ reviews' }, { icon: 'Truck', label: 'Delivery in 30–45 min' }],
  primaryCta: 'Order now',
  secondaryCta: 'View menu',
  photos: [{ url: photo(PHOTOS.feast), alt: 'A table of freshly cooked Filipino dishes' }],
}

/** Uses one photo. */
export function buildHeroSplit(copy: TemplateCopy = HERO_SPLIT_SAMPLE): Section {
  const dish = photoAt(copy, HERO_SPLIT_SAMPLE, 0)
  return section({
    label: 'Hero — split',
    widths: [52, 48],
    style: { padding: box(96, 24), gap: 56, background: { type: 'color', color: '@background' } },
    mobile: { padding: box(32, 16, 48, 16), gap: 28 },
    columns: [
      {
        style: { gap: 20 },
        mobile: { textAlign: 'center', gap: 16 },
        widgets: [
          animate(badge(copy.kicker, 'Sparkles'), 'fade'),
          animate(heading(copy.headline, 'h1', DISPLAY, DISPLAY_MOBILE), 'slide-up', 80),
          animate(text(copy.body, LEAD, LEAD_MOBILE), 'slide-up', 160),
          animate(buttons([button(copy.primaryCta, MENU_ANCHOR, 'solid', 'ShoppingBag'), button(copy.secondaryCta, MENU_ANCHOR, 'outline')]), 'slide-up', 240),
          ...highlightList(copy.highlights, 'inline', { fontSize: 14, color: '@muted', accentColor: '@primary', margin: box(8, 0, 0, 0) }, CENTER_MOBILE),
        ],
      },
      {
        widgets: [
          animate(
            image(dish.url, dish.alt, { radius: 28, aspectRatio: '4/3', shadow: 'xl' }, { radius: 20, aspectRatio: '16/9' }),
            'zoom',
            120,
          ),
        ],
      },
    ],
  })
}

export function buildHeroCentered(): Section {
  return section({
    label: 'Hero — centered',
    widths: [100],
    style: {
      padding: box(112, 24),
      background: { type: 'gradient', gradient: { kind: 'linear', from: '@surface', to: '@background', angle: 180 } },
    },
    mobile: { padding: box(56, 16) },
    columns: [
      {
        style: { gap: 20, textAlign: 'center' },
        widgets: [
          badge('Freshly made · Ready in 20 minutes', 'Flame', { accentColor: '@accent', background: { type: 'color', color: '@background' } }),
          heading('Big flavor, delivered hot to your door', 'h1', { ...DISPLAY, fontSize: 64, maxWidth: 860, textAlign: 'center' }, DISPLAY_MOBILE),
          text('Order straight from our kitchen — no app, no markup, just great food.', { ...LEAD, maxWidth: 620, textAlign: 'center' }, LEAD_MOBILE),
          buttons([button('Order now', MENU_ANCHOR, 'solid', 'ArrowRight'), button('View menu', MENU_ANCHOR, 'ghost')], {
            textAlign: 'center',
            margin: box(8, 0, 0, 0),
          }),
        ],
      },
    ],
  })
}

function featureCard(): NodeStyle {
  return { gap: 12, padding: box(28), radius: 20, background: { type: 'color', color: '@surface' } }
}

function featureColumn(icon: string, title: string, body: string): ColumnSpec {
  return {
    style: featureCard(),
    mobile: { padding: box(22) },
    widgets: [
      widget('icon', { name: icon }, {
        size: 26,
        color: '@primary',
        textAlign: 'left',
        accentColor: '@background',
        padding: box(14),
        radius: 999,
        margin: box(0, 0, 4, 0),
      }),
      heading(title, 'h3', { fontSize: 22, fontWeight: 700, lineHeight: 1.25 }, { fontSize: 20 }),
      text(body, { fontSize: 16 }, { fontSize: 15 }),
    ],
  }
}

export function buildFeatures(): Section {
  return section({
    label: 'Why order from us',
    widths: [33, 34, 33],
    style: { padding: box(72, 24), gap: 24, align: 'stretch' },
    mobile: { padding: box(40, 16), gap: 16 },
    columns: [
      featureColumn('ChefHat', 'Cooked to order', 'Every dish is made fresh when you order — never reheated, never rushed.'),
      featureColumn('Truck', 'Fast local delivery', 'Hot food at your door in 30–45 minutes, or skip the line with pickup.'),
      featureColumn('Wallet', 'Pay your way', 'GCash, Maya, card or cash on delivery — whatever is easiest for you.'),
    ],
  })
}

export function buildPromoBanner(): Section {
  return section({
    label: 'Promo with countdown',
    widths: [100],
    style: {
      padding: box(64, 24),
      color: WHITE,
      background: { type: 'gradient', gradient: { kind: 'linear', from: '@primary', to: '@accent', angle: 120 } },
    },
    mobile: { padding: box(44, 16) },
    columns: [
      {
        style: { gap: 18, textAlign: 'center' },
        widgets: [
          badge('Limited time', 'Timer', { color: WHITE, accentColor: WHITE, background: { type: 'color', color: WHITE_GLASS } }),
          heading('20% off every party tray this weekend', 'h2', { ...TITLE, fontSize: 46, color: WHITE, textAlign: 'center' }, { fontSize: 30 }),
          text('Perfect for birthdays and salo-salo. Order ahead — trays are limited per day.', { ...LEAD, color: WHITE_SOFT, maxWidth: 600, textAlign: 'center' }, LEAD_MOBILE),
          widget('countdown', {}, { fontSize: 20, textAlign: 'center', accentColor: WHITE_GLASS, accentTextColor: WHITE }, { fontSize: 16 }),
          buttons([button('Claim the deal', MENU_ANCHOR, 'solid', 'Gift')], {
            textAlign: 'center',
            accentColor: WHITE,
            accentTextColor: '@primary',
          }),
        ],
      },
    ],
  })
}

const GALLERY_SHOTS: readonly [keyof typeof PHOTOS, string][] = [
  ['bowl', 'Fresh rice bowl with vegetables'],
  ['ramen', 'Steaming bowl of noodle soup'],
  ['burger', 'Stacked burger with fries'],
  ['pizza', 'Wood-fired pizza'],
  ['salad', 'Colorful salad bowl'],
  ['pancakes', 'Stack of pancakes with berries'],
]

export function buildGallery(): Section {
  return section({
    label: 'Gallery',
    widths: [100],
    mobile: { padding: box(40, 16) },
    columns: [
      {
        style: { gap: 14, textAlign: 'center' },
        widgets: [
          heading('Straight from our kitchen', 'h2', TITLE, TITLE_MOBILE),
          text('A taste of what customers order again and again.', { ...LEAD, maxWidth: 560, textAlign: 'center' }, LEAD_MOBILE),
          widget(
            'gallery',
            { images: GALLERY_SHOTS.map(([key, alt]) => galleryImage(photo(PHOTOS[key], 900), alt)) },
            { columns: 3, gap: 16, radius: 18, margin: box(16, 0, 0, 0) },
            { columns: 2, gap: 10, radius: 12 },
          ),
        ],
      },
    ],
  })
}

export function buildTestimonial(): Section {
  return section({
    label: 'Testimonial',
    widths: [100],
    style: { padding: box(88, 24), background: { type: 'color', color: '@surface' } },
    mobile: { padding: box(48, 16) },
    columns: [
      {
        style: { gap: 20, textAlign: 'center' },
        widgets: [
          badge('5.0 · Google reviews', 'Star', { accentColor: '#f59e0b', color: '@text', background: { type: 'color', color: '@background' } }),
          heading(
            '“The best kare-kare we have had outside of Lola’s kitchen. We order every Sunday now.”',
            'p',
            { fontFamily: 'playfair-display', fontSize: 34, fontWeight: 600, lineHeight: 1.35, italic: true, maxWidth: 820, textAlign: 'center' },
            { fontSize: 24 },
          ),
          text('**Maria S.** — Quezon City', { fontSize: 16, textAlign: 'center' }, { fontSize: 15 }),
        ],
      },
    ],
  })
}

export const MAP_EMBED =
  '<iframe src="https://www.google.com/maps?q=Manila&output=embed" width="100%" height="320" style="border:0" loading="lazy"></iframe>'

export function buildLocationHours(): Section {
  return section({
    label: 'Location & hours',
    widths: [45, 55],
    style: { padding: box(72, 24), gap: 48 },
    mobile: { padding: box(40, 16), gap: 24 },
    columns: [
      {
        style: { gap: 18, verticalAlign: 'center' },
        mobile: { textAlign: 'center' },
        widgets: [
          heading('Visit us', 'h2', TITLE, TITLE_MOBILE),
          iconList(
            [
              listItem('MapPin', '123 Mabini St., Malate, Manila'),
              listItem('Clock', 'Mon–Sun · 10:00 AM – 10:00 PM'),
              listItem('Phone', '0917 123 4567'),
            ],
            'vertical',
            { fontSize: 17, gap: 14, size: 22, color: '@text', accentColor: '@primary' },
            { fontSize: 16, textAlign: 'left' },
          ),
          buttons([
            button('Get directions', 'https://www.google.com/maps?q=Manila', 'solid', 'MapPin'),
            button('Call us', 'tel:+639171234567', 'outline', 'Phone'),
          ]),
        ],
      },
      {
        widgets: [widget('embed', { code: MAP_EMBED, height: 320, autoHeight: false }, { radius: 20, shadow: 'md' })],
      },
    ],
  })
}

export function buildCtaBand(): Section {
  return section({
    label: 'Call to action',
    widths: [66, 34],
    style: { padding: box(56, 24), color: WHITE, background: { type: 'color', color: '@primary' } },
    mobile: { padding: box(40, 16), gap: 20 },
    columns: [
      {
        style: { gap: 8 },
        mobile: { textAlign: 'center' },
        widgets: [
          heading('Hungry? Your next meal is a few taps away.', 'h2', { ...TITLE, fontSize: 34, color: WHITE }, { fontSize: 26 }),
          text('Order online for pickup or delivery — we’ll message you when it’s on the way.', { fontSize: 17, color: WHITE_SOFT }, { fontSize: 15 }),
        ],
      },
      {
        style: { verticalAlign: 'center' },
        widgets: [
          buttons([button('Order now', MENU_ANCHOR, 'solid', 'ArrowRight')], {
            textAlign: 'right',
            accentColor: WHITE,
            accentTextColor: '@primary',
          }),
        ],
      },
    ],
  })
}

export interface SectionPreset {
  id: string
  name: string
  description: string
  build: () => Section
}

export const SECTION_PRESETS: readonly SectionPreset[] = [
  { id: 'hero-split', name: 'Hero — split', description: 'Headline, pitch and order buttons beside a big food photo.', build: () => buildHeroSplit() },
  { id: 'hero-centered', name: 'Hero — centered', description: 'Centered headline and buttons on a soft brand gradient.', build: buildHeroCentered },
  { id: 'features', name: '3 features', description: 'Three icon cards that answer “why order from us?”.', build: buildFeatures },
  { id: 'promo-countdown', name: 'Promo + countdown', description: 'Bold brand-gradient band with a live countdown to create urgency.', build: buildPromoBanner },
  { id: 'gallery', name: 'Photo gallery', description: 'Six-photo grid — 3 across on desktop, 2 on phones.', build: buildGallery },
  { id: 'testimonial', name: 'Testimonial', description: 'One big customer quote with a star-rating badge.', build: buildTestimonial },
  { id: 'location-hours', name: 'Location & hours', description: 'Address, hours and phone with a Google Map and directions button.', build: buildLocationHours },
  { id: 'cta-band', name: 'Call to action', description: 'Brand-colored strip with one strong “Order now” button.', build: buildCtaBand },
]
