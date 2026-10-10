import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { OnboardingAnswers } from '@/lib/onboarding/answers'
import type { StoreFacts } from '@/lib/onboarding/design-step'
import type { LaunchCopy } from '@/lib/onboarding/launch-copy'
import { summarizeMenuShape } from '@/lib/onboarding/design-pick'

const CATEGORIES = [
  { id: 'c2', name: 'Drinks' },
  { id: 'c1', name: 'Silog' },
]
const ITEMS = [
  { name: 'Iced tea', price: 45, category_id: 'c2', is_featured: false },
  { name: 'Tapsilog', price: 180, category_id: 'c1', is_featured: true },
  { name: 'Longsilog', price: 160, category_id: 'c1', is_featured: true },
]

interface FakeAdminOptions {
  failTable?: string
  updatedRows?: number
}

/** Answers each read with its rows and records every update. */
function fakeAdmin({ failTable, updatedRows = 1 }: FakeAdminOptions = {}) {
  const updates: Array<Record<string, unknown>> = []
  const client = {
    from(table: string) {
      const rows = table === 'categories' ? CATEGORIES : table === 'menu_items' ? ITEMS : [{ button_primary_color: '#fbd905' }]
      const result = table === failTable ? { data: null, error: { message: 'statement timeout' } } : { data: rows, error: null }
      const query: Record<string, unknown> = {}
      for (const method of ['eq', 'order']) query[method] = () => query
      query.select = () => query
      query.limit = () => Promise.resolve(result)
      query.update = (patch: Record<string, unknown>) => {
        updates.push(patch)
        const updated: Record<string, unknown> = {}
        updated.eq = () => updated
        updated.select = () => Promise.resolve({ data: Array.from({ length: updatedRows }, () => ({ id: 't1' })), error: null })
        return updated
      }
      return query
    },
  } as unknown as SupabaseClient
  return { client, updates }
}

const ANSWERS = {
  storeName: 'Migos', storeType: 'restaurant', tagline: '', orderTypes: ['pickup', 'delivery'], bestSellers: [],
  payments: { cash: true, gcash: { number: '09171234567', accountName: 'Migo' } },
  hours: { open: '09:00', close: '21:00', closedDays: [], stopOrdersWhenClosed: true },
} as unknown as OnboardingAnswers

function facts(overrides: Partial<StoreFacts> = {}): StoreFacts {
  return {
    shape: summarizeMenuShape([
      { categoryName: 'Silog', itemName: 'Tapsilog', price: 180 },
      { categoryName: 'Silog', itemName: 'Longsilog', price: 160 },
    ]),
    favorites: [{ name: 'Tapsilog', price: 180 }, { name: 'Longsilog', price: 160 }],
    buttonColor: '#fbd905',
    ...overrides,
  }
}

beforeEach(() => {
  jest.restoreAllMocks()
  jest.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe('readStoreFacts', () => {
  test('reads the menu in category order, the featured best sellers and the button color', async () => {
    const { readStoreFacts } = await import('@/lib/onboarding/design-step')
    const result = await readStoreFacts(fakeAdmin().client as never, 't1')
    expect(result.shape.categories).toEqual([{ name: 'Drinks', itemCount: 1 }, { name: 'Silog', itemCount: 2 }])
    expect(result.favorites).toEqual([{ name: 'Tapsilog', price: 180 }, { name: 'Longsilog', price: 160 }])
    expect(result.buttonColor).toBe('#fbd905')
  })

  test('a failed read is an error (the step keeps the starting look), not a silent guess', async () => {
    const { readStoreFacts } = await import('@/lib/onboarding/design-step')
    await expect(readStoreFacts(fakeAdmin({ failTable: 'menu_items' }).client as never, 't1')).rejects.toThrow(/Menu items could not be read/)
  })
})

const AI_COPY: LaunchCopy = {
  kicker: 'Silog all day',
  headline: 'Breakfast plates worth waking up for',
  body: 'Tapsilog and longsilog, cooked when you order.',
  highlights: ['Tapsilog and longsilog', 'Garlic rice on every plate', 'Sawsawan on the side'],
  primaryCta: 'Order now',
}

describe('chooseLaunchDesign', () => {
  test("the owner's look wins; the AI still picks the hero and writes its words", async () => {
    const { chooseLaunchDesign } = await import('@/lib/onboarding/design-step')
    const model = jest.fn<(messages: Array<{ content: string }>) => Promise<string>>(
      async () => JSON.stringify({ look: 'kiosk', hero: 'press-quote', copy: AI_COPY }),
    )
    const choice = await chooseLaunchDesign({ ...ANSWERS, look: 'bistro' }, facts(), model)
    expect(choice).toMatchObject({ look: 'bistro', hero: 'press-quote', source: 'owner', copy: AI_COPY })
    expect(JSON.parse(model.mock.calls[0][0][1].content).fixedLook).toBe('bistro')
  })

  test('an owner pick saved by the older wizard maps to its new look', async () => {
    const { chooseLaunchDesign } = await import('@/lib/onboarding/design-step')
    const choice = await chooseLaunchDesign({ ...ANSWERS, look: 'board' as never }, facts(), jest.fn(async () => ''))
    expect(choice).toMatchObject({ look: 'sidebar', source: 'owner' })
  })

  test('the AI chooses the look, the hero and its words, shown only heroes the store can have', async () => {
    // Arrange
    const { chooseLaunchDesign } = await import('@/lib/onboarding/design-step')
    const model = jest.fn<(messages: Array<{ content: string }>) => Promise<string>>(
      async () => JSON.stringify({ look: 'kiosk', hero: 'chalkboard', fontPair: 'bold display', reason: 'Short silog menu, fast picks.', copy: AI_COPY }),
    )

    // Act
    const choice = await chooseLaunchDesign(ANSWERS, facts(), model)

    // Assert
    expect(choice).toEqual({ look: 'kiosk', hero: 'chalkboard', fontPair: 'bold display', reason: 'Short silog menu, fast picks.', source: 'ai', copy: AI_COPY })
    const shown = JSON.parse(model.mock.calls[0][0][1].content) as { availableHeroes: string[]; neutralBrand: boolean }
    expect(shown.availableHeroes).toContain('chalkboard')
    expect(shown.neutralBrand).toBe(false)
  })

  test("a hero the store cannot have (no best sellers) is replaced by the look's rule hero", async () => {
    const { chooseLaunchDesign } = await import('@/lib/onboarding/design-step')
    const choice = await chooseLaunchDesign(ANSWERS, facts({ favorites: [] }), jest.fn(async () => '{"look":"shop","hero":"chalkboard"}'))
    expect(choice).toMatchObject({ look: 'shop', hero: 'split-photo', source: 'ai' })
  })

  test('AI words that claim what we cannot know are replaced with honest store-type copy', async () => {
    const { chooseLaunchDesign } = await import('@/lib/onboarding/design-step')
    const model = jest.fn(async () => JSON.stringify({ look: 'shop', hero: 'split-photo', copy: { ...AI_COPY, headline: 'Rated 4.9 by 1,000 regulars', kicker: 'Since 1998' } }))
    const choice = await chooseLaunchDesign(ANSWERS, facts(), model)
    expect(choice.copy.headline).toBe('Migos')
    expect(choice.copy.kicker).not.toContain('1998')
    expect(choice.copy.body).toBe(AI_COPY.body)
  })

  test('an off-catalog AI answer falls back to the menu rules and honest copy', async () => {
    const { chooseLaunchDesign } = await import('@/lib/onboarding/design-step')
    const { RULE_REASONS } = await import('@/lib/onboarding/design-pick')
    const choice = await chooseLaunchDesign(ANSWERS, facts(), jest.fn(async () => '{"look":"menuboard"}'))
    expect(choice.source).toBe('rules')
    expect(choice.reason).toBe(RULE_REASONS[choice.look])
    expect(choice.copy.headline).toBe('Migos')
  })

  test('an AI that throws (no key, timeout) falls back to the menu rules, never fails', async () => {
    const { chooseLaunchDesign } = await import('@/lib/onboarding/design-step')
    const choice = await chooseLaunchDesign(ANSWERS, facts(), jest.fn(async () => { throw new Error('OPENROUTER_API_KEY is missing') }))
    expect(choice.source).toBe('rules')
  })

  const BIG_MENU = summarizeMenuShape(['Main Course', 'Appetizers', 'Pasta', 'Seafoods', 'Rice Platter', 'Drinks'].flatMap((name) =>
    Array.from({ length: 8 }, (_, index) => ({ categoryName: name, itemName: `${name} ${index}`, price: 180 }))))

  test('a black-and-white brand gets a hero with its own colors (the AI wrote the words)', async () => {
    const { chooseLaunchDesign } = await import('@/lib/onboarding/design-step')
    const model = jest.fn(async () => JSON.stringify({ look: 'sidebar', copy: AI_COPY }))
    const choice = await chooseLaunchDesign(ANSWERS, facts({ shape: BIG_MENU, buttonColor: '#1c1c1c' }), model)
    expect(choice).toMatchObject({ look: 'sidebar', hero: 'press-quote', source: 'ai' })
  })

  test('without an AI headline the press quote is never used: it would quote the store name', async () => {
    const { chooseLaunchDesign } = await import('@/lib/onboarding/design-step')
    const down = jest.fn(async () => { throw new Error('down') })
    const choice = await chooseLaunchDesign(ANSWERS, facts({ shape: BIG_MENU, buttonColor: '#1c1c1c' }), down)
    expect(choice).toMatchObject({ look: 'sidebar', source: 'rules' })
    expect(choice.hero).not.toBe('press-quote')
    const asked = await chooseLaunchDesign(ANSWERS, facts(), jest.fn(async () => JSON.stringify({ look: 'shop', hero: 'press-quote', copy: { headline: 'Rated 5 stars' } })))
    expect(asked.hero).not.toBe('press-quote')
  })

  test('an empty menu skips the AI and designs for the store type', async () => {
    const { chooseLaunchDesign } = await import('@/lib/onboarding/design-step')
    const { STORE_TYPES } = await import('@/lib/onboarding/store-type')
    const model = jest.fn(async () => '{"look":"kiosk"}')
    const choice = await chooseLaunchDesign({ ...ANSWERS, storeType: 'cafe' }, facts({ shape: summarizeMenuShape([]), favorites: [] }), model)
    expect(model).not.toHaveBeenCalled()
    expect(choice).toMatchObject({ look: STORE_TYPES.cafe.look, hero: 'cafe-minimal', source: 'rules' })
  })
})

describe('isNeutralColor', () => {
  test('black, white and greys are neutral; brand colors and oxblood are not', async () => {
    const { isNeutralColor } = await import('@/lib/onboarding/design-step')
    for (const hex of ['#1c1c1c', '#ffffff', '#6b6b6b']) expect(isNeutralColor(hex)).toBe(true)
    for (const hex of ['#c0392b', '#fbd905', '#3b0d14']) expect(isNeutralColor(hex)).toBe(false)
    expect(isNeutralColor('not a color')).toBe(false)
  })
})

describe('applyLaunchHero', () => {
  test('saves a validated design and switches the custom hero on, like Hero Builder publish', async () => {
    const { applyLaunchHero, launchHeroInput } = await import('@/lib/onboarding/design-step')
    const { heroDesignV5Schema } = await import('@/lib/hero-builder/schema')
    const { client, updates } = fakeAdmin()

    await applyLaunchHero(client as never, 't1', 'how-it-works', launchHeroInput(ANSWERS, facts()), AI_COPY)

    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({ hero_preset: 'custom', hero_section_enabled: true })
    expect(updates[0]).not.toHaveProperty('header_color')
    expect(heroDesignV5Schema.safeParse(JSON.parse(updates[0].hero_design as string)).success).toBe(true)
    expect(updates[0].hero_design).toContain('GCash or Cash.')
    expect(updates[0].hero_design).toContain(AI_COPY.headline)
  })

  test('a hero with its own band paints the header to match, in the same write', async () => {
    const { applyLaunchHero, launchHeroInput } = await import('@/lib/onboarding/design-step')
    const { client, updates } = fakeAdmin()
    await applyLaunchHero(client as never, 't1', 'press-quote', launchHeroInput(ANSWERS, facts()), AI_COPY)
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({ header_color: '#3b0d14', menu_main_header_text_color: '#e0b44c', hero_preset: 'custom' })
  })

  test('an update that reached no row is an error, not a silent success', async () => {
    const { applyLaunchHero, launchHeroInput } = await import('@/lib/onboarding/design-step')
    await expect(applyLaunchHero(fakeAdmin({ updatedRows: 0 }).client as never, 't1', 'split-photo', launchHeroInput(ANSWERS, facts()), AI_COPY))
      .rejects.toThrow(/Hero could not be saved/)
  })

  test('the hero facts come from the answers and the menu', async () => {
    const { launchHeroInput } = await import('@/lib/onboarding/design-step')
    const input = launchHeroInput(ANSWERS, facts())
    expect(input.paymentNames).toEqual(['GCash', 'Cash'])
    expect(input.storeType).toBe('restaurant')
    expect(input.menuCategories).toEqual(['Silog'])
  })
})
