// ---------------------------------------------------------------------------
// Hero Builder v5 — ordering-led starting designs, modelled on the layouts of
// large restaurant brands (structure only; copy and photos are ours):
// location index, stories stack, limited-time drop, order-ways hub, two
// paths. Registered in templates.ts.
// ---------------------------------------------------------------------------

import {
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
  type ColumnSpec,
} from './section-presets'
import type { HeroDesignV5, NodeStyle, Section } from './types'

// ── Location index ─────────────────────────────────────────────────────────
// Every branch named up top, then one card per branch with its own photo.

const CHARCOAL = '#1c1b19'
const AMBER = '#f59e0b'

interface Branch {
  name: string
  address: string
  hours: string
  photoKey: keyof typeof PHOTOS
  mapQuery: string
}

const BRANCHES: readonly Branch[] = [
  { name: 'Poblacion, Makati', address: '5921 Alfonso St.', hours: 'Daily · 11 AM – 11 PM', photoKey: 'restaurantWarm', mapQuery: 'Poblacion+Makati' },
  { name: 'BGC, Taguig', address: '28th St. cor. 7th Ave.', hours: 'Daily · 10 AM – 10 PM', photoKey: 'restaurant', mapQuery: 'BGC+Taguig' },
  { name: 'Maginhawa, QC', address: '112 Maginhawa St.', hours: 'Tue–Sun · 11 AM – 10 PM', photoKey: 'diningRoom', mapQuery: 'Maginhawa+Quezon+City' },
]

function branchCard(branch: Branch): ColumnSpec {
  return {
    style: { gap: 10, padding: box(14, 14, 20, 14), radius: 14, color: CHARCOAL, background: { type: 'color', color: WHITE } },
    widgets: [
      image(photo(PHOTOS[branch.photoKey], 800), `Our ${branch.name} branch`, { radius: 8, aspectRatio: '3/2', margin: box(0, 0, 6, 0) }),
      heading(branch.name, 'h3', { fontFamily: 'oswald', fontSize: 22, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: CHARCOAL }, { fontSize: 20 }),
      iconList(
        [listItem('MapPin', branch.address), listItem('Clock', branch.hours)],
        'vertical',
        { fontSize: 14, gap: 6, size: 16, color: 'rgba(28,27,25,0.75)', accentColor: AMBER },
      ),
      buttons([button('Directions', `https://www.google.com/maps?q=${branch.mapQuery}`, 'ghost', 'ArrowRight')], { fontSize: 14, accentColor: CHARCOAL, margin: box(0, 0, 0, -16) }, {}),
    ],
  }
}

export function buildLocationIndex(): HeroDesignV5 {
  const hero = section({
    label: 'Hero — location index',
    widths: [100],
    style: { padding: box(96, 24, 48, 24), color: WHITE, background: { type: 'color', color: CHARCOAL } },
    mobile: { padding: box(56, 16, 32, 16) },
    columns: [
      {
        style: { gap: 20, textAlign: 'center' },
        widgets: [
          animate(heading('Find us across the city', 'h1', { fontFamily: 'oswald', fontSize: 64, fontWeight: 600, lineHeight: 1, textTransform: 'uppercase', letterSpacing: 1, color: WHITE, textAlign: 'center' }, { fontSize: 40 }), 'slide-up'),
          iconList(
            [listItem('MapPin', 'Makati'), listItem('MapPin', 'BGC'), listItem('MapPin', 'Quezon City'), listItem('MapPin', 'Pasig'), listItem('MapPin', 'Alabang')],
            'inline',
            { fontFamily: 'dm-sans', fontSize: 18, gap: 24, color: WHITE_SOFT, accentColor: AMBER, textAlign: 'center' },
            { fontSize: 15, gap: 12 },
          ),
          buttons([button('Order now', MENU_ANCHOR, 'solid', 'ShoppingBag'), button('View menu', MENU_ANCHOR, 'outline')], {
            textAlign: 'center',
            accentColor: AMBER,
            accentTextColor: CHARCOAL,
            radius: 6,
            margin: box(8, 0, 0, 0),
          }),
        ],
      },
    ],
  })
  const branches = section({
    label: 'Branches',
    widths: [1, 1, 1],
    style: { padding: box(16, 24, 96, 24), gap: 20, align: 'stretch', background: { type: 'color', color: CHARCOAL } },
    mobile: { padding: box(8, 16, 56, 16), gap: 16 },
    columns: BRANCHES.map(branchCard),
  })
  return design([hero, branches])
}

// ── Stories stack ──────────────────────────────────────────────────────────
// Consecutive photo panels, each one piece of news with its own button.

const PEACH = '#fdba74'

interface Story {
  label: string
  tag: string
  photoKey: keyof typeof PHOTOS
  title: string
  body: string
  cta: string
}

const STORIES: readonly Story[] = [
  { label: 'Hero — story', tag: 'Weekends · 9 AM – 2 PM', photoKey: 'pancakes', title: 'Brunch is here: fluffy stacks, longsilog and bottomless coffee', body: 'Our new weekend menu, served until 2 PM — or delivered to your door.', cta: 'See the brunch menu' },
  { label: 'Story — new branch', tag: 'Now open', photoKey: 'restaurant', title: 'Say hello to our new home in BGC', body: 'Bigger kitchen, longer tables, same recipes. Pickup and delivery start today.', cta: 'Order now' },
  { label: 'Story — party trays', tag: 'Pre-order', photoKey: 'feast', title: 'Party trays are back for the holidays', body: 'Feeds 8 to 10. Order two days ahead and we’ll have it ready, hot and packed.', cta: 'Pre-order a tray' },
]

function storySection(story: Story, isFirst: boolean): Section {
  const titleStyle: NodeStyle = { fontFamily: 'space-grotesk', fontSize: isFirst ? 54 : 44, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1, color: WHITE, maxWidth: 720 }
  return section({
    label: story.label,
    widths: [100],
    style: {
      minHeight: isFirst ? 600 : 480,
      verticalAlign: 'end',
      padding: box(72, 24, 64, 24),
      background: {
        type: 'image',
        color: '#111111',
        image: { url: photo(PHOTOS[story.photoKey], 2000), size: 'cover', position: 'center' },
        overlay: darkOverlay(55),
      },
    },
    mobile: { minHeight: isFirst ? 480 : 400, padding: box(56, 16, 40, 16) },
    columns: [
      {
        style: { gap: 16 },
        widgets: [
          badge(story.tag, 'Sparkles', { color: CHARCOAL, accentColor: CHARCOAL, background: { type: 'color', color: PEACH } }),
          animate(heading(story.title, isFirst ? 'h1' : 'h2', titleStyle, { fontSize: isFirst ? 34 : 30 }), 'slide-up'),
          text(story.body, { fontSize: 18, color: WHITE_SOFT, maxWidth: 560 }, { fontSize: 15 }),
          buttons([button(story.cta, MENU_ANCHOR, 'solid', 'ArrowRight')], { accentColor: WHITE, accentTextColor: CHARCOAL, radius: 999 }),
        ],
      },
    ],
  })
}

export function buildStoriesStack(): HeroDesignV5 {
  return design(STORIES.map((story, index) => storySection(story, index === 0)))
}

// ── Limited-time drop ──────────────────────────────────────────────────────
// A saturated color field, a loud product launch and a promo-code pill.

export function buildLimitedDrop(): HeroDesignV5 {
  const hero = section({
    label: 'Hero — limited drop',
    widths: [46, 54],
    style: { padding: box(80, 24), gap: 48, align: 'center', color: WHITE, background: { type: 'color', color: '@primary' } },
    mobile: { padding: box(40, 16, 48, 16), gap: 24, reverse: true },
    columns: [
      {
        style: { gap: 18 },
        mobile: { textAlign: 'center', gap: 14 },
        widgets: [
          badge('All-new · Limited time', 'Zap', { color: WHITE, accentColor: WHITE, background: { type: 'color', color: WHITE_GLASS } }),
          animate(
            heading('The double-cheese smash is here', 'h1', { fontFamily: 'anton', fontSize: 92, fontWeight: 400, lineHeight: 0.95, textTransform: 'uppercase', color: WHITE }, { fontSize: 52 }),
            'slide-up',
          ),
          text('Two smashed patties, double cheese and our house sauce on a toasted potato bun. Only until the end of the month.', { fontFamily: 'poppins', fontSize: 18, lineHeight: 1.6, color: WHITE_SOFT, maxWidth: 480 }, { fontSize: 15 }),
          badge('Use code SMASH50 for ₱50 off', 'Tag', { color: WHITE, accentColor: WHITE, borderWidth: 2, borderStyle: 'dashed', borderColor: WHITE, background: { type: 'none' } }),
          buttons([button('Order now', MENU_ANCHOR, 'solid', 'ShoppingBag'), button('View menu', MENU_ANCHOR, 'ghost')], {
            accentColor: WHITE,
            accentTextColor: '@primary',
            radius: 999,
            margin: box(6, 0, 0, 0),
          }),
        ],
      },
      {
        widgets: [
          animate(
            image(photo(PHOTOS.burger, 1200), 'The new double-cheese smash burger', { radius: 999, aspectRatio: '1/1', borderWidth: 10, borderColor: WHITE_GLASS, maxWidth: 520, align: 'center' }, { maxWidth: 300, borderWidth: 6 }),
            'zoom',
            150,
          ),
        ],
      },
    ],
  })
  const finePrint = section({
    label: 'Fine print',
    widths: [100],
    style: { padding: box(14, 24), background: { type: 'color', color: '#111111' } },
    mobile: { padding: box(12, 16) },
    columns: [
      {
        widgets: [
          text('Limited time only, while supplies last. Code valid once per customer on orders of ₱300 and up.', { fontSize: 12, color: 'rgba(255,255,255,0.6)', textAlign: 'center' }, { fontSize: 11 }),
        ],
      },
    ],
  })
  return design([hero, finePrint])
}

// ── Order-ways hub ─────────────────────────────────────────────────────────
// A short photo banner, then one card per way to order.

const ROUNDED_LOWER: NodeStyle = { fontFamily: 'nunito', fontWeight: 800, textTransform: 'lowercase' }

function orderWayCard(icon: string, title: string, body: string, cta: string): ColumnSpec {
  return {
    style: { gap: 10, padding: box(24), radius: 20, shadow: 'lg', background: { type: 'color', color: '@background' } },
    mobile: { padding: box(20) },
    widgets: [
      widget('icon', { name: icon }, { size: 24, color: '@primary', textAlign: 'left', accentColor: '@surface', padding: box(12), radius: 999 }),
      heading(title, 'h3', { ...ROUNDED_LOWER, fontSize: 24, lineHeight: 1.2 }, { fontSize: 22 }),
      text(body, { fontSize: 15, lineHeight: 1.5 }, { fontSize: 14 }),
      buttons([button(cta, MENU_ANCHOR, 'solid')], { ...ROUNDED_LOWER, fontSize: 15, radius: 999, margin: box(4, 0, 0, 0) }),
    ],
  }
}

export function buildOrderWays(): HeroDesignV5 {
  const banner = section({
    label: 'Hero — order ways',
    widths: [100],
    style: {
      minHeight: 400,
      verticalAlign: 'center',
      padding: box(96, 24, 120, 24),
      background: {
        type: 'image',
        color: '#1c1917',
        image: { url: photo(PHOTOS.riceBowl, 2000), size: 'cover', position: 'center' },
        overlay: darkOverlay(50),
      },
    },
    mobile: { minHeight: 300, padding: box(72, 16, 88, 16) },
    columns: [
      {
        style: { gap: 18, textAlign: 'center' },
        widgets: [
          animate(heading('good food, your way', 'h1', { ...ROUNDED_LOWER, fontSize: 68, lineHeight: 1, color: WHITE, textAlign: 'center' }, { fontSize: 42 }), 'slide-up'),
          buttons([button('Order now', MENU_ANCHOR, 'solid', 'ShoppingBag')], { ...ROUNDED_LOWER, textAlign: 'center', accentColor: WHITE, accentTextColor: CHARCOAL, radius: 999 }),
        ],
      },
    ],
  })
  // Pulled up over the banner's bottom padding so the cards overlap the photo edge.
  const ways = section({
    label: 'Ways to order',
    widths: [25, 25, 25, 25],
    style: { margin: box(-72, 0, 0, 0), padding: box(0, 24, 80, 24), gap: 16, align: 'stretch' },
    mobile: { margin: box(-48, 0, 0, 0), padding: box(0, 16, 48, 16), gap: 12 },
    columns: [
      orderWayCard('Utensils', 'dine in', 'Walk in or call ahead for a table.', 'view menu'),
      orderWayCard('Bike', 'delivery', 'Hot to your door in 30–45 minutes.', 'order now'),
      orderWayCard('ShoppingBag', 'pickup', 'Order ahead and skip the line.', 'order ahead'),
      orderWayCard('Calendar', 'catering', 'Party trays for 10 to 100 guests.', 'plan a party'),
    ],
  })
  return design([banner, ways])
}

// ── Two paths ──────────────────────────────────────────────────────────────
// Two side-by-side offer cards for groups: pick the one that fits.

const KRAFT = '#f3ead9'

interface PathCard {
  icon: string
  title: string
  price: string
  points: readonly string[]
  cta: string
  variant: 'solid' | 'outline'
}

const PATHS: readonly [PathCard, PathCard] = [
  {
    icon: 'Users',
    title: 'Group order',
    price: 'No minimum · everyone picks',
    points: ['Share one link with your team', 'Everyone adds their own meal', 'One delivery, one payment', 'Names printed on every box'],
    cta: 'Start a group order',
    variant: 'solid',
  },
  {
    icon: 'PartyPopper',
    title: 'Party trays',
    price: 'From ₱1,200 · serves 8–10',
    points: ['Pancit, lumpia, lechon kawali & more', 'Order 2 days ahead', 'Utensils and plates included', 'Free delivery over ₱3,000'],
    cta: 'Order party trays',
    variant: 'outline',
  },
]

function pathCard(path: PathCard): ColumnSpec {
  return {
    style: { gap: 14, padding: box(32), radius: 18, shadow: 'md', background: { type: 'color', color: WHITE } },
    mobile: { padding: box(24) },
    widgets: [
      widget('icon', { name: path.icon }, { size: 26, color: '@primary', textAlign: 'left', accentColor: KRAFT, padding: box(12), radius: 999 }),
      heading(path.title, 'h3', { fontFamily: 'poppins', fontSize: 28, fontWeight: 600, lineHeight: 1.2, color: CHARCOAL }, { fontSize: 24 }),
      badge(path.price, 'Tag', { color: CHARCOAL, accentColor: '@primary', textTransform: 'none', letterSpacing: 0, background: { type: 'color', color: KRAFT } }),
      iconList(
        path.points.map((point) => listItem('CheckCircle2', point)),
        'vertical',
        { fontSize: 15, gap: 10, size: 18, color: 'rgba(28,27,25,0.82)', accentColor: '@primary', margin: box(4, 0) },
      ),
      buttons([button(path.cta, MENU_ANCHOR, path.variant, 'ArrowRight')], { align: 'stretch', textAlign: 'center', radius: 12 }),
    ],
  }
}

export function buildTwoPaths(): HeroDesignV5 {
  const intro = section({
    label: 'Hero — two paths',
    widths: [100],
    style: { padding: box(96, 24, 32, 24), background: { type: 'color', color: KRAFT } },
    mobile: { padding: box(56, 16, 24, 16) },
    columns: [
      {
        style: { gap: 16, textAlign: 'center' },
        widgets: [
          animate(heading('Feeding a crowd?', 'h1', { fontFamily: 'poppins', fontSize: 54, fontWeight: 600, lineHeight: 1.1, letterSpacing: -1, color: CHARCOAL, textAlign: 'center' }, { fontSize: 36 }), 'slide-up'),
          text('Office lunch or family party — choose how you want to order and we’ll handle the rest.', { fontSize: 19, color: 'rgba(28,27,25,0.72)', maxWidth: 560, textAlign: 'center' }, { fontSize: 16 }),
        ],
      },
    ],
  })
  const paths = section({
    label: 'Two paths',
    widths: [50, 50],
    style: { padding: box(16, 24, 96, 24), gap: 24, align: 'stretch', contentWidth: 960, background: { type: 'color', color: KRAFT } },
    mobile: { padding: box(8, 16, 56, 16), gap: 16 },
    columns: PATHS.map(pathCard),
  })
  return design([intro, paths])
}
