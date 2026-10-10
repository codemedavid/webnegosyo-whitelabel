import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { OnboardingAnswers } from '@/lib/onboarding/answers'
import type { StoreFacts } from '@/lib/onboarding/design-step'
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

describe('chooseLaunchDesign', () => {
  test("the owner's look wins without asking the AI; the hero follows the look", async () => {
    const { chooseLaunchDesign } = await import('@/lib/onboarding/design-step')
    const model = jest.fn(async () => '{"look":"kiosk"}')
    const choice = await chooseLaunchDesign({ ...ANSWERS, look: 'bistro' }, facts(), model)
    expect(choice).toMatchObject({ look: 'bistro', hero: 'poster', source: 'owner' })
    expect(model).not.toHaveBeenCalled()
  })

  test('an owner pick saved by the older wizard maps to its new look', async () => {
    const { chooseLaunchDesign } = await import('@/lib/onboarding/design-step')
    const choice = await chooseLaunchDesign({ ...ANSWERS, look: 'board' as never }, facts(), jest.fn(async () => ''))
    expect(choice).toMatchObject({ look: 'sidebar', hero: 'none', source: 'owner' })
  })

  test('the AI chooses the look and the hero, shown only heroes the store can have', async () => {
    // Arrange
    const { chooseLaunchDesign } = await import('@/lib/onboarding/design-step')
    const model = jest.fn<(messages: Array<{ content: string }>) => Promise<string>>(
      async () => '{"look":"kiosk","hero":"ways","fontPair":"bold display","reason":"Short silog menu, fast picks."}',
    )

    // Act
    const choice = await chooseLaunchDesign(ANSWERS, facts(), model)

    // Assert
    expect(choice).toEqual({ look: 'kiosk', hero: 'ways', fontPair: 'bold display', reason: 'Short silog menu, fast picks.', source: 'ai' })
    const shown = JSON.parse(model.mock.calls[0][0][1].content) as { availableHeroes: string[] }
    expect(shown.availableHeroes).toEqual(['ways', 'steps', 'favorites', 'poster', 'none'])
  })

  test('a hero the store cannot have (no best sellers) is replaced by the look\'s rule hero', async () => {
    const { chooseLaunchDesign } = await import('@/lib/onboarding/design-step')
    const choice = await chooseLaunchDesign(ANSWERS, facts({ favorites: [] }), jest.fn(async () => '{"look":"shop","hero":"favorites"}'))
    expect(choice).toMatchObject({ look: 'shop', hero: 'steps', source: 'ai' })
  })

  test('an off-catalog AI answer falls back to the menu rules', async () => {
    const { chooseLaunchDesign } = await import('@/lib/onboarding/design-step')
    const { RULE_REASONS } = await import('@/lib/onboarding/design-pick')
    const choice = await chooseLaunchDesign(ANSWERS, facts(), jest.fn(async () => '{"look":"menuboard"}'))
    expect(choice.source).toBe('rules')
    expect(choice.reason).toBe(RULE_REASONS[choice.look])
  })

  test('an AI that throws (no key, timeout) falls back to the menu rules, never fails', async () => {
    const { chooseLaunchDesign } = await import('@/lib/onboarding/design-step')
    const choice = await chooseLaunchDesign(ANSWERS, facts(), jest.fn(async () => { throw new Error('OPENROUTER_API_KEY is missing') }))
    expect(choice.source).toBe('rules')
  })

  test('an empty menu skips the AI and designs for the store type', async () => {
    const { chooseLaunchDesign } = await import('@/lib/onboarding/design-step')
    const { STORE_TYPES } = await import('@/lib/onboarding/store-type')
    const model = jest.fn(async () => '{"look":"kiosk"}')
    const choice = await chooseLaunchDesign({ ...ANSWERS, storeType: 'cafe' }, facts({ shape: summarizeMenuShape([]), favorites: [] }), model)
    expect(model).not.toHaveBeenCalled()
    expect(choice).toMatchObject({ look: STORE_TYPES.cafe.look, source: 'rules' })
  })
})

describe('applyLaunchHero', () => {
  test('saves a validated design and switches the custom hero on, like Hero Builder publish', async () => {
    const { applyLaunchHero, launchHeroInput } = await import('@/lib/onboarding/design-step')
    const { heroDesignV5Schema } = await import('@/lib/hero-builder/schema')
    const { client, updates } = fakeAdmin()

    await applyLaunchHero(client as never, 't1', 'steps', launchHeroInput(ANSWERS, facts()))

    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({ hero_preset: 'custom', hero_section_enabled: true })
    expect(heroDesignV5Schema.safeParse(JSON.parse(updates[0].hero_design as string)).success).toBe(true)
    expect(updates[0].hero_design).toContain('GCash or Cash.')
  })

  test('"none" only switches the hero off', async () => {
    const { applyLaunchHero, launchHeroInput } = await import('@/lib/onboarding/design-step')
    const { client, updates } = fakeAdmin()
    await applyLaunchHero(client as never, 't1', 'none', launchHeroInput(ANSWERS, facts()))
    expect(updates).toEqual([{ hero_section_enabled: false }])
  })

  test('an update that reached no row is an error, not a silent success', async () => {
    const { applyLaunchHero, launchHeroInput } = await import('@/lib/onboarding/design-step')
    await expect(applyLaunchHero(fakeAdmin({ updatedRows: 0 }).client as never, 't1', 'poster', launchHeroInput(ANSWERS, facts())))
      .rejects.toThrow(/Hero could not be saved/)
  })

  test("the hero's words come from the answers: tagline, or the store type's line", async () => {
    const { launchHeroInput } = await import('@/lib/onboarding/design-step')
    const { STORE_TYPES } = await import('@/lib/onboarding/store-type')
    expect(launchHeroInput(ANSWERS, facts()).line).toBe(STORE_TYPES.restaurant.heroLine)
    expect(launchHeroInput({ ...ANSWERS, tagline: 'Silog all day' }, facts()).line).toBe('Silog all day')
    expect(launchHeroInput(ANSWERS, facts()).paymentNames).toEqual(['GCash', 'Cash'])
  })
})
