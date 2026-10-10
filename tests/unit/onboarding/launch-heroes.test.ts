import { describe, it, expect } from '@jest/globals'
import {
  LAUNCH_HEROES,
  availableLaunchHeroes,
  buildLaunchHero,
  formatClock,
  hoursLine,
  launchHeroHeader,
  type LaunchHeroInput,
} from '@/lib/onboarding/launch-heroes'
import type { LaunchCopy } from '@/lib/onboarding/launch-copy'
import { HERO_TEMPLATES } from '@/lib/hero-builder/templates'
import { heroDesignV5Schema } from '@/lib/hero-builder/schema'
import { LIMITS } from '@/lib/hero-builder/constants'
import { STORE_TYPES, type StoreType } from '@/lib/onboarding/store-type'

const INPUT: LaunchHeroInput = {
  storeName: "Juan's Kitchen",
  storeType: 'restaurant',
  orderTypes: ['pickup', 'delivery'],
  paymentNames: ['GCash', 'Cash'],
  hours: { open: '09:00', close: '21:30', closedDays: [] },
  favorites: [{ name: 'Tapsilog', price: 180 }, { name: 'Longsilog', price: 160.5 }],
  menuCategories: ['Silog'],
  buttonColor: '#fbd905',
}

const COPY: LaunchCopy = {
  kicker: 'Silog all day',
  headline: 'Breakfast plates worth waking up for',
  body: 'Tapsilog, longsilog and more, cooked when you order.',
  highlights: ['Tapsilog and longsilog', 'Garlic rice on every plate', 'Sawsawan on the side'],
  primaryCta: 'Order now',
}

/** Every piece of copy a visitor reads: headings, texts, badges, list items, button labels (not section names). */
function copyOf(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  const node = value as Record<string, unknown>
  const isSection = Array.isArray(node.columns)
  const own = ['text', 'label'].flatMap((key) => (typeof node[key] === 'string' && !(isSection && key === 'label') ? [node[key] as string] : []))
  return [...own, ...Object.values(node).flatMap((child) => (Array.isArray(child) ? child.flatMap(copyOf) : copyOf(child)))]
}

function urlsOf(value: unknown): string[] {
  return JSON.stringify(value).match(/https?:\/\/[^"]+/g) ?? []
}

/** The gallery template's own sample copy, minus generic lines any store shares ("View menu", "Pay your way"). */
function sampleLines(hero: string): string[] {
  const template = HERO_TEMPLATES.find((entry) => entry.id === hero)
  if (!template) throw new Error(`No gallery template ${hero}`)
  return copyOf(template.build()).filter((line) => !/^(view menu|order now|pick your favorites|pay your way)$/i.test(line) && line.length > 3)
}

const STORE_TYPE_IDS = Object.keys(STORE_TYPES) as StoreType[]

describe('buildLaunchHero', () => {
  it('every launch hero is a real gallery template', () => {
    const galleryIds = HERO_TEMPLATES.map((template) => template.id)
    for (const hero of LAUNCH_HEROES) expect(galleryIds).toContain(hero)
  })

  it.each(STORE_TYPE_IDS)('every hero a %s store can have passes the Hero Builder publish check', (storeType) => {
    const input = { ...INPUT, storeType }
    for (const hero of availableLaunchHeroes(input)) {
      const design = buildLaunchHero(hero, input, COPY)
      expect(heroDesignV5Schema.safeParse(design).success).toBe(true)
      expect(JSON.stringify(design).length).toBeLessThan(LIMITS.designBytes)
    }
  })

  it.each(LAUNCH_HEROES)('%s keeps none of the template\'s sample copy (no fake reviews, years or places)', (hero) => {
    const copy = copyOf(buildLaunchHero(hero, INPUT, COPY))
    for (const line of sampleLines(hero)) expect(copy).not.toContain(line)
    expect(copy.join(' | ')).not.toMatch(/rated|reviews|★|est\.|since|minutes|min\b|\d+\+|makati|quezon|maginhawa|regular/i)
  })

  it.each(LAUNCH_HEROES)('%s shows only numbers the store gave us (hours, prices)', (hero) => {
    const copy = copyOf(buildLaunchHero(hero, INPUT, COPY)).join(' | ')
    const numbers = copy.match(/\d[\d.,:]*/g) ?? []
    // Hours and prices from the answers; how it works numbers its steps.
    for (const number of numbers) expect(['9:00', '9:30', '180', '160.50', '01', '02', '03']).toContain(number)
  })

  it.each(LAUNCH_HEROES)('%s says the AI headline and links every button to the menu', (hero) => {
    const design = buildLaunchHero(hero, INPUT, COPY)
    const copy = copyOf(design).join(' | ')
    if (hero === 'masthead-panorama') expect(copy).toContain("juan's kitchen")
    else expect(copy).toContain('Breakfast plates worth waking up for')
    const hrefs = JSON.stringify(design).match(/"href":"[^"]*"/g) ?? []
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) expect(href).toBe('"href":"#storefront-menu"')
  })

  it('photos come from the stock set and suit the store: no burger or salad on a silog restaurant', () => {
    for (const hero of availableLaunchHeroes(INPUT)) {
      for (const url of urlsOf(buildLaunchHero(hero, INPUT, COPY))) {
        expect(url).toMatch(/^https:\/\/images\.unsplash\.com\//)
        expect(url).not.toContain('1568901346375') // burger
        expect(url).not.toContain('1512621776951') // salad
      }
    }
  })

  it('milk tea and "other" stores only get the photo-free hero', () => {
    expect(availableLaunchHeroes({ ...INPUT, storeType: 'milk_tea' })).toEqual(['how-it-works'])
    expect(urlsOf(buildLaunchHero('how-it-works', { ...INPUT, storeType: 'other' }, COPY))).toEqual([])
  })

  it('pins the button color to the storefront button so its label stays readable', () => {
    for (const hero of LAUNCH_HEROES) expect(buildLaunchHero(hero, INPUT, COPY).theme.colors.primary).toBe('#fbd905')
  })

  it('the press quote is signed by the store and drops the stars', () => {
    const copy = copyOf(buildLaunchHero('press-quote', INPUT, COPY))
    expect(copy).toContain('“Breakfast plates worth waking up for”')
    expect(copy).toContain("— Juan's Kitchen")
    expect(copy.join(' ')).not.toContain('★')
  })

  it('the chalkboard lists the real best sellers with their prices', () => {
    const copy = copyOf(buildLaunchHero('chalkboard', INPUT, COPY)).join(' | ')
    expect(copy).toContain('Tapsilog — ₱180')
    expect(copy).toContain('Longsilog — ₱160.50')
    expect(copy).toContain('Our best sellers')
  })

  it('photo heroes list the real hours and ways to order', () => {
    const copy = copyOf(buildLaunchHero('full-bleed-photo', { ...INPUT, hours: { open: '07:00', close: '19:00', closedDays: [1, 0] } }, COPY)).join(' | ')
    expect(copy).toContain('Open 7:00 AM – 7:00 PM · Closed Sun, Mon')
    expect(copy).toContain('Pickup · Delivery')
    expect(copy).toContain('Pay with GCash or Cash')
  })

  it('how it works names the real payment methods and ways to get the food', () => {
    const copy = copyOf(buildLaunchHero('how-it-works', INPUT, COPY)).join(' | ')
    expect(copy).toContain('GCash or Cash.')
    expect(copy).toContain('Pick it up or get it delivered')
  })

  it('owner text cannot turn into hero markup or links', () => {
    const design = buildLaunchHero('press-quote', { ...INPUT, storeName: '**Big** [click](https://evil.example)' }, COPY)
    const copy = copyOf(design).join(' | ')
    expect(copy).toContain('Big (click)(https://evil.example)')
    expect(copy).not.toMatch(/\*|\[/)
  })

  it('every call returns a fresh design (no shared ids)', () => {
    expect(JSON.stringify(buildLaunchHero('split-photo', INPUT, COPY))).not.toBe(JSON.stringify(buildLaunchHero('split-photo', INPUT, COPY)))
  })
})

describe('availableLaunchHeroes', () => {
  it('a restaurant with best sellers can have every restaurant hero', () => {
    expect(availableLaunchHeroes(INPUT)).toEqual([
      'press-quote', 'full-bleed-photo', 'split-photo', 'card-on-photo', 'fine-dining', 'masthead-panorama', 'chalkboard', 'how-it-works',
    ])
  })

  it('drops the chalkboard with fewer than two priced best sellers', () => {
    expect(availableLaunchHeroes({ ...INPUT, favorites: [{ name: 'A', price: 100 }, { name: 'B', price: 0 }] })).not.toContain('chalkboard')
  })

  it('drops the masthead for a name too long to set huge on a phone', () => {
    expect(availableLaunchHeroes({ ...INPUT, storeName: 'Karamotan Grill' })).toContain('masthead-panorama')
    expect(availableLaunchHeroes({ ...INPUT, storeName: 'Lola Remedios Carinderia' })).not.toContain('masthead-panorama')
    expect(availableLaunchHeroes({ ...INPUT, storeName: 'Kapampangan Eats' })).not.toContain('masthead-panorama')
    // A name of only symbols cleans to '' — an empty masthead is no hero at all.
    expect(availableLaunchHeroes({ ...INPUT, storeName: '***' })).not.toContain('masthead-panorama')
  })

  it('cafés and bakeries get the café and bakery templates; restaurants do not', () => {
    expect(availableLaunchHeroes({ ...INPUT, storeType: 'cafe' })).toEqual(expect.arrayContaining(['cafe-minimal', 'bakery']))
    expect(availableLaunchHeroes(INPUT)).not.toContain('bakery')
  })
})

describe('launchHeroHeader', () => {
  it('paints the header like the hero band, as on Karamotan Grill', () => {
    expect(launchHeroHeader('press-quote')).toEqual({ header_color: '#3b0d14', header_font_color: '#e0b44c', menu_main_header_text_color: '#e0b44c' })
  })

  it('leaves the header alone for heroes without a solid band', () => {
    expect(launchHeroHeader('full-bleed-photo')).toEqual({})
    expect(launchHeroHeader('how-it-works')).toEqual({})
  })
})

describe('hours wording', () => {
  it('reads 24h times as a customer would', () => {
    expect(formatClock('00:00')).toBe('12:00 AM')
    expect(formatClock('12:00')).toBe('12:00 PM')
    expect(formatClock('21:30')).toBe('9:30 PM')
  })

  it('says "daily" when the store never closes for a day', () => {
    expect(hoursLine({ open: '09:00', close: '21:00', closedDays: [] })).toBe('Open daily, 9:00 AM – 9:00 PM')
    // A day number outside Sun–Sat never prints as "Closed undefined".
    expect(hoursLine({ open: '09:00', close: '21:00', closedDays: [9] })).toBe('Open daily, 9:00 AM – 9:00 PM')
  })
})
