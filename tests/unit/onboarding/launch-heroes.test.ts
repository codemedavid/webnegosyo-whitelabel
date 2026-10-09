import { describe, it, expect } from '@jest/globals'
import {
  LAUNCH_HEROES,
  availableLaunchHeroes,
  buildLaunchHero,
  formatClock,
  hoursLine,
  type LaunchHeroInput,
} from '@/lib/onboarding/launch-heroes'
import { heroDesignV5Schema } from '@/lib/hero-builder/schema'
import { LIMITS } from '@/lib/hero-builder/constants'

const INPUT: LaunchHeroInput = {
  storeName: "Juan's Kitchen",
  line: 'Home-style silog, all day',
  orderTypes: ['pickup', 'delivery'],
  paymentNames: ['GCash', 'Cash'],
  hours: { open: '09:00', close: '21:30', closedDays: [] },
  favorites: [{ name: 'Tapsilog', price: 180 }, { name: 'Longsilog', price: 160.5 }],
  buttonColor: '#fbd905',
}

/** Every piece of copy in a design: headings, texts, badges, list items, button labels. */
function copyOf(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  const node = value as Record<string, unknown>
  const own = ['text', 'label'].flatMap((key) => (typeof node[key] === 'string' ? [node[key] as string] : []))
  return [...own, ...Object.values(node).flatMap((child) => (Array.isArray(child) ? child.flatMap(copyOf) : copyOf(child)))]
}

function urlsOf(value: unknown): string[] {
  return JSON.stringify(value).match(/https?:\/\/[^"]+/g) ?? []
}

describe('buildLaunchHero', () => {
  it.each(LAUNCH_HEROES)('%s passes the Hero Builder publish check', (hero) => {
    const design = buildLaunchHero(hero, INPUT)
    const parsed = heroDesignV5Schema.safeParse(design)
    expect(parsed.success).toBe(true)
    expect(design.sections.length).toBeGreaterThan(0)
    expect(JSON.stringify(design).length).toBeLessThan(LIMITS.designBytes)
  })

  it.each(LAUNCH_HEROES)('%s uses no stock photo or video and no invented claims', (hero) => {
    const design = buildLaunchHero(hero, INPUT)
    expect(urlsOf(design)).toEqual([])
    const copy = copyOf(design).join(' | ')
    expect(copy).not.toMatch(/rated|reviews|est\.|since|minutes|min\b|\d+\+|neighbors|makati|quezon|award/i)
  })

  it.each(LAUNCH_HEROES)('%s names the store and links every button to the menu', (hero) => {
    const design = buildLaunchHero(hero, INPUT)
    expect(copyOf(design).join(' ')).toContain("Juan's Kitchen")
    const hrefs = JSON.stringify(design).match(/"href":"[^"]*"/g) ?? []
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) expect(href).toBe('"href":"#storefront-menu"')
  })

  it('pins the button color to the storefront button so its label stays readable', () => {
    for (const hero of LAUNCH_HEROES) expect(buildLaunchHero(hero, INPUT).theme.colors).toEqual({ primary: '#fbd905' })
  })

  it('ways to order shows only the order types the store offers', () => {
    const copy = copyOf(buildLaunchHero('ways', INPUT)).join(' | ')
    expect(copy).toContain('Pickup')
    expect(copy).toContain('Delivery')
    expect(copy).not.toContain('Dine in')
  })

  it('how it works names the real payment methods and ways to get the food', () => {
    const copy = copyOf(buildLaunchHero('steps', INPUT)).join(' | ')
    expect(copy).toContain('GCash or Cash.')
    expect(copy).toContain('3. Pick it up or get it delivered')
  })

  it('best sellers shows the real dishes and prices, at most three', () => {
    const many = { ...INPUT, favorites: [...INPUT.favorites, { name: 'Bangsilog', price: 175 }, { name: 'Tocilog', price: 150 }] }
    const copy = copyOf(buildLaunchHero('favorites', many)).join(' | ')
    expect(copy).toContain('Tapsilog | ₱180')
    expect(copy).toContain('Longsilog | ₱160.50')
    expect(copy).not.toContain('Tocilog')
  })

  it('the poster shows the real opening hours', () => {
    const copy = copyOf(buildLaunchHero('poster', { ...INPUT, hours: { open: '07:00', close: '19:00', closedDays: [1, 0] } })).join(' | ')
    expect(copy).toContain('Open 7:00 AM – 7:00 PM · Closed Sun, Mon')
  })

  it('owner text cannot turn into hero markup or links', () => {
    const design = buildLaunchHero('steps', { ...INPUT, storeName: '**Big** [click](https://evil.example)', line: '*best* food' })
    const copy = copyOf(design).join(' | ')
    expect(copy).toContain('Big (click)(https://evil.example)')
    expect(copy).not.toMatch(/\*|\[/)
  })

  it('every call returns a fresh design (no shared ids)', () => {
    const first = JSON.stringify(buildLaunchHero('ways', INPUT))
    const second = JSON.stringify(buildLaunchHero('ways', INPUT))
    expect(first).not.toBe(second)
  })
})

describe('availableLaunchHeroes', () => {
  it('offers every hero when the store has the facts for it', () => {
    expect(availableLaunchHeroes(INPUT)).toEqual(['ways', 'steps', 'favorites', 'poster', 'none'])
  })

  it('drops ways to order with one order type and best sellers with fewer than two', () => {
    expect(availableLaunchHeroes({ orderTypes: ['pickup'], favorites: [{ name: 'A', price: 1 }] })).toEqual(['steps', 'poster', 'none'])
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
  })
})
