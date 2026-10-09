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
import { LAUNCH_HERO_CHOICES } from '@/lib/onboarding/launch-heroes'

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
  it('a big sidebar menu starts right at the top, with no hero', () => {
    expect(pickHeroByRules('sidebar', LAUNCH_HERO_CHOICES)).toBe('none')
  })

  it('takes the first hero the look calls for that the store can have', () => {
    expect(pickHeroByRules('shop', LAUNCH_HERO_CHOICES)).toBe('favorites')
    expect(pickHeroByRules('shop', ['steps', 'poster', 'none'])).toBe('steps')
    expect(pickHeroByRules('kiosk', ['steps', 'poster', 'none'])).toBe('steps')
    expect(pickHeroByRules('bistro', LAUNCH_HERO_CHOICES)).toBe('poster')
  })

  it('always answers a hero every store can have', () => {
    for (const look of STORE_LOOK_IDS) expect(['steps', 'poster', 'none']).toContain(pickHeroByRules(look, ['steps', 'poster', 'none']))
  })
})

describe('buildDesignPrompt', () => {
  const shape = summarizeMenuShape([...rows('Silog', 4, 160), ...rows('Drinks', 3, 45)])
  const messages = buildDesignPrompt({
    storeName: 'Migos', storeType: 'restaurant', tagline: 'Silog all day', orderTypes: ['pickup', 'delivery'], shape,
    heroes: ['steps', 'poster', 'none'],
  })

  it('lists every look and hero so the model can only choose from the catalogs', () => {
    const system = messages[0].content
    for (const look of STORE_LOOK_IDS) expect(system).toContain(`"${look}"`)
    for (const hero of LAUNCH_HERO_CHOICES) expect(system).toContain(`"${hero}"`)
  })

  it('tells the model which heroes this store can have, in the data message', () => {
    expect(JSON.parse(messages[1].content).availableHeroes).toEqual(['steps', 'poster', 'none'])
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
    const answer = parseDesignAnswer('```json\n{"look":"kiosk","hero":"ways","fontPair":"bold display","reason":"Short menu, fast picks."}\n```')
    expect(answer).toEqual({ look: 'kiosk', hero: 'ways', fontPair: 'bold display', reason: 'Short menu, fast picks.' })
  })

  it('drops a hero the store cannot have or that is not in the catalog, keeping the look', () => {
    expect(parseDesignAnswer('{"look":"kiosk","hero":"ways"}', ['steps', 'none'])?.hero).toBeNull()
    expect(parseDesignAnswer('{"look":"kiosk","hero":"video-hero"}')?.hero).toBeNull()
    expect(parseDesignAnswer('{"look":"kiosk","hero":"none"}', ['steps', 'none'])?.hero).toBe('none')
  })

  it('refuses a look outside the catalog, including the retired menu board', () => {
    expect(parseDesignAnswer('{"look":"board","reason":"x"}')).toBeNull()
    expect(parseDesignAnswer('{"look":"menuboard","reason":"x"}')).toBeNull()
    expect(parseDesignAnswer('{"look":"__proto__","reason":"x"}')).toBeNull()
  })

  it('drops an unknown font pairing but keeps the look', () => {
    const answer = parseDesignAnswer('{"look":"cafe","fontPair":"Comic Sans","reason":"Mostly coffee."}')
    expect(answer).toEqual({ look: 'cafe', fontPair: null, hero: null, reason: 'Mostly coffee.' })
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
