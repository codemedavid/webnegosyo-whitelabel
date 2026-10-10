import { describe, it, expect } from '@jest/globals'
import {
  RULE_REASONS,
  buildDesignPrompt,
  parseDesignAnswer,
  pickHeroByRules,
  pickLookByRules,
  summarizeMenuShape,
  type MenuShapeRow,
} from '@/lib/onboarding/design-pick'
import { STORE_LOOKS, STORE_LOOK_IDS, STORE_TYPES } from '@/lib/onboarding/store-type'
import { LAUNCH_HEROES, type LaunchHero } from '@/lib/onboarding/launch-heroes'

function rows(category: string, count: number, price = 150): MenuShapeRow[] {
  return Array.from({ length: count }, (_, index) => ({ categoryName: category, itemName: `${category} ${index + 1}`, price }))
}

describe('summarizeMenuShape', () => {
  it('counts items per category, keeping the menu order', () => {
    // Arrange
    const menu = [...rows('Silog', 3), ...rows('Drinks', 2, 40)]

    // Act
    const shape = summarizeMenuShape(menu)

    // Assert
    expect(shape.itemCount).toBe(5)
    expect(shape.categories).toEqual([{ name: 'Silog', itemCount: 3 }, { name: 'Drinks', itemCount: 2 }])
  })

  it('reads the median and highest price, ignoring zero prices', () => {
    const shape = summarizeMenuShape([
      { categoryName: 'Mains', itemName: 'A', price: 100 },
      { categoryName: 'Mains', itemName: 'B', price: 300 },
      { categoryName: 'Mains', itemName: 'C', price: 200 },
      { categoryName: 'Mains', itemName: 'Free water', price: 0 },
    ])
    expect(shape.medianPrice).toBe(200)
    expect(shape.maxPrice).toBe(300)
  })

  it('measures how much of the menu is drinks', () => {
    const shape = summarizeMenuShape([...rows('Milk Tea', 6, 120), ...rows('Snacks', 2, 90)])
    expect(shape.drinkShare).toBeCloseTo(0.75)
  })

  it('an empty menu has no prices and no drinks', () => {
    const shape = summarizeMenuShape([])
    expect(shape).toMatchObject({ itemCount: 0, categories: [], medianPrice: null, maxPrice: null, drinkShare: 0 })
  })

  it('caps the sample of dish names it hands to the AI', () => {
    const shape = summarizeMenuShape(rows('Mains', 200))
    expect(shape.sampleItems.length).toBeLessThanOrEqual(24)
  })
})

describe('pickLookByRules', () => {
  it("falls back to the store type's look without a menu", () => {
    expect(pickLookByRules('cafe', null)).toBe(STORE_TYPES.cafe.look)
    expect(pickLookByRules('bakery', summarizeMenuShape([]))).toBe(STORE_TYPES.bakery.look)
  })

  it('a drink-heavy menu swipes like a café app, with stickers for milk tea', () => {
    const drinks = summarizeMenuShape([...rows('Coffee', 8, 140), ...rows('Pastries', 2, 90)])
    expect(pickLookByRules('cafe', drinks)).toBe('cafe')
    expect(pickLookByRules('milk_tea', drinks)).toBe('sticker')
  })

  it('a big menu gets categories down the side', () => {
    const big = summarizeMenuShape(['Silog', 'Pares', 'Noodles', 'Rice', 'Sides', 'Desserts'].flatMap((name) => rows(name, 4)))
    expect(pickLookByRules('restaurant', big)).toBe('sidebar')
  })

  it('a pricier restaurant gets the bistro look', () => {
    const premium = summarizeMenuShape(rows('Steaks', 10, 680))
    expect(pickLookByRules('restaurant', premium)).toBe('bistro')
  })

  it('a short menu that is not a restaurant reads fastest as tiles', () => {
    expect(pickLookByRules('other', summarizeMenuShape(rows('Burgers', 8, 120)))).toBe('kiosk')
  })

  it('never picks a look outside the catalog', () => {
    const shapes = [null, summarizeMenuShape(rows('Mains', 3)), summarizeMenuShape(rows('Coffee', 50))]
    for (const type of Object.keys(STORE_TYPES) as Array<keyof typeof STORE_TYPES>) {
      for (const shape of shapes) expect(STORE_LOOK_IDS).toContain(pickLookByRules(type, shape))
    }
  })

  it('has a plain-words reason for every look', () => {
    for (const look of STORE_LOOK_IDS) expect(RULE_REASONS[look].length).toBeGreaterThan(10)
  })
})

describe('pickHeroByRules', () => {
  const ALL: readonly LaunchHero[] = LAUNCH_HEROES

  it('takes the first hero the look calls for that the store can have', () => {
    expect(pickHeroByRules({ look: 'sidebar', storeType: 'restaurant', available: ALL, isNeutralBrand: false })).toBe('press-quote')
    expect(pickHeroByRules({ look: 'bistro', storeType: 'restaurant', available: ALL, isNeutralBrand: false })).toBe('fine-dining')
    expect(pickHeroByRules({ look: 'shop', storeType: 'restaurant', available: ['split-photo', 'how-it-works'], isNeutralBrand: false })).toBe('split-photo')
  })

  it("puts the store type's own template first", () => {
    expect(pickHeroByRules({ look: 'shop', storeType: 'bakery', available: ALL, isNeutralBrand: false })).toBe('bakery')
    expect(pickHeroByRules({ look: 'shop', storeType: 'cafe', available: ALL, isNeutralBrand: false })).toBe('cafe-minimal')
  })

  it('a black-and-white brand gets a hero that brings its own colors', () => {
    expect(pickHeroByRules({ look: 'shop', storeType: 'cafe', available: ALL, isNeutralBrand: true })).toBe('bakery')
    expect(pickHeroByRules({ look: 'shop', storeType: 'restaurant', available: ['split-photo', 'full-bleed-photo', 'how-it-works'], isNeutralBrand: true })).toBe('full-bleed-photo')
  })

  it('always answers a hero the store can have, even when nothing the look wants is available', () => {
    for (const look of STORE_LOOK_IDS) {
      expect(pickHeroByRules({ look, storeType: 'milk_tea', available: ['how-it-works'], isNeutralBrand: false })).toBe('how-it-works')
    }
  })
})

describe('buildDesignPrompt', () => {
  const shape = summarizeMenuShape([...rows('Silog', 4, 160), ...rows('Drinks', 3, 45)])
  const messages = buildDesignPrompt({
    storeName: 'Migos', storeType: 'restaurant', tagline: 'Silog all day', orderTypes: ['pickup', 'delivery'], shape,
    heroes: ['press-quote', 'how-it-works'],
    isNeutralBrand: true,
  })

  it('lists every look and hero so the model can only choose from the catalogs', () => {
    const system = messages[0].content
    for (const look of STORE_LOOK_IDS) expect(system).toContain(`"${look}"`)
    for (const hero of LAUNCH_HEROES) expect(system).toContain(`"${hero}"`)
  })

  it('tells the model which heroes this store can have and whether its brand is neutral, in the data message', () => {
    const facts = JSON.parse(messages[1].content)
    expect(facts.availableHeroes).toEqual(['press-quote', 'how-it-works'])
    expect(facts.neutralBrand).toBe(true)
    expect(facts.fixedLook).toBeUndefined()
  })

  it("passes the owner's look as fixed when they picked one", () => {
    const fixed = buildDesignPrompt({ storeName: 'Migos', storeType: 'restaurant', orderTypes: [], shape, heroes: ['how-it-works'], isNeutralBrand: false, fixedLook: 'bistro' })
    expect(JSON.parse(fixed[1].content).fixedLook).toBe('bistro')
  })

  it('asks for hero words and forbids claims the store never made', () => {
    const system = messages[0].content
    expect(system).toContain('"copy"')
    expect(system).toMatch(/no numbers, prices, ratings, reviews, awards, years/)
  })

  it('hands the menu over as facts in the user message, never in the system prompt', () => {
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).not.toContain('Migos')
    expect(messages[1].role).toBe('user')
    expect(messages[1].content).toContain('Silog')
  })
})

describe('parseDesignAnswer', () => {
  it('reads a JSON answer, even inside a code fence', () => {
    const answer = parseDesignAnswer('```json\n{"look":"kiosk","hero":"chalkboard","fontPair":"bold display","reason":"Short menu, fast picks.","copy":{"headline":"Hi there"}}\n```')
    expect(answer).toEqual({ look: 'kiosk', hero: 'chalkboard', fontPair: 'bold display', reason: 'Short menu, fast picks.', copy: { headline: 'Hi there' } })
  })

  it('drops a hero the store cannot have or that is not in the catalog, keeping the look', () => {
    expect(parseDesignAnswer('{"look":"kiosk","hero":"chalkboard"}', ['how-it-works'])?.hero).toBeNull()
    expect(parseDesignAnswer('{"look":"kiosk","hero":"video-hero"}')?.hero).toBeNull()
    expect(parseDesignAnswer('{"look":"kiosk","hero":"how-it-works"}', ['how-it-works'])?.hero).toBe('how-it-works')
  })

  it('refuses a look outside the catalog, including the retired menu board', () => {
    expect(parseDesignAnswer('{"look":"board","reason":"x"}')).toBeNull()
    expect(parseDesignAnswer('{"look":"menuboard","reason":"x"}')).toBeNull()
    expect(parseDesignAnswer('{"look":"__proto__","reason":"x"}')).toBeNull()
  })

  it('drops an unknown font pairing but keeps the look', () => {
    const answer = parseDesignAnswer('{"look":"cafe","fontPair":"Comic Sans","reason":"Mostly coffee."}')
    expect(answer).toEqual({ look: 'cafe', fontPair: null, hero: null, reason: 'Mostly coffee.', copy: null })
  })

  it('gives a missing reason the look\'s own reason, and caps a long one', () => {
    expect(parseDesignAnswer('{"look":"bistro"}')?.reason).toBe(RULE_REASONS.bistro)
    expect(parseDesignAnswer(`{"look":"bistro","reason":"${'a'.repeat(900)}"}`)?.reason.length).toBeLessThanOrEqual(160)
  })

  it('returns null for prose or broken JSON', () => {
    expect(parseDesignAnswer('I think kiosk is best')).toBeNull()
    expect(parseDesignAnswer('{"look": "kiosk"')).toBeNull()
    expect(parseDesignAnswer('')).toBeNull()
  })

  it('every catalog look round-trips', () => {
    for (const look of STORE_LOOK_IDS) {
      expect(parseDesignAnswer(JSON.stringify({ look, reason: STORE_LOOKS[look].label }))?.look).toBe(look)
    }
  })
})
