import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { OnboardingAnswers } from '@/lib/onboarding/answers'

const CATEGORIES = [
  { id: 'c2', name: 'Drinks' },
  { id: 'c1', name: 'Silog' },
]
const ITEMS = [
  { name: 'Iced tea', price: 45, category_id: 'c2' },
  { name: 'Tapsilog', price: 180, category_id: 'c1' },
  { name: 'Longsilog', price: 160, category_id: 'c1' },
]

/** Answers each table read with its rows; records the tables it was asked for. */
function fakeAdmin(menu: { categories: unknown[]; items: unknown[] } = { categories: CATEGORIES, items: ITEMS }, failTable?: string) {
  const tablesRead: string[] = []
  const client = {
    from(table: string) {
      tablesRead.push(table)
      const rows = table === 'categories' ? menu.categories : menu.items
      const result = table === failTable ? { data: null, error: { message: 'statement timeout' } } : { data: rows, error: null }
      const query: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'order']) query[method] = () => query
      query.limit = () => Promise.resolve(result)
      return query
    },
  } as unknown as SupabaseClient
  return { client, tablesRead }
}

const ANSWERS = {
  storeName: 'Migos', storeType: 'restaurant', tagline: '', orderTypes: ['pickup'], bestSellers: [],
} as unknown as OnboardingAnswers

beforeEach(() => {
  jest.restoreAllMocks()
  jest.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe('chooseLaunchDesign', () => {
  test("the owner's pick wins: no menu read, no AI call", async () => {
    // Arrange
    const { chooseLaunchDesign } = await import('@/lib/onboarding/design-step')
    const { client, tablesRead } = fakeAdmin()
    const model = jest.fn(async () => '{"look":"kiosk"}')

    // Act
    const choice = await chooseLaunchDesign(client as never, 't1', { ...ANSWERS, look: 'bistro' }, model)

    // Assert
    expect(choice).toMatchObject({ look: 'bistro', source: 'owner' })
    expect(model).not.toHaveBeenCalled()
    expect(tablesRead).toEqual([])
  })

  test('an owner pick saved by the older wizard maps to its new look', async () => {
    const { chooseLaunchDesign } = await import('@/lib/onboarding/design-step')
    const choice = await chooseLaunchDesign(fakeAdmin().client as never, 't1', { ...ANSWERS, look: 'board' as never }, jest.fn(async () => ''))
    expect(choice).toMatchObject({ look: 'sidebar', source: 'owner' })
  })

  test('the AI chooses from the menu it is shown, categories in menu order', async () => {
    // Arrange
    const { chooseLaunchDesign } = await import('@/lib/onboarding/design-step')
    const model = jest.fn<(messages: Array<{ content: string }>) => Promise<string>>(
      async () => '{"look":"kiosk","fontPair":"bold display","reason":"A short silog menu reads fastest as tiles."}',
    )

    // Act
    const choice = await chooseLaunchDesign(fakeAdmin().client as never, 't1', ANSWERS, model)

    // Assert
    expect(choice).toEqual({ look: 'kiosk', fontPair: 'bold display', reason: 'A short silog menu reads fastest as tiles.', source: 'ai' })
    const facts = JSON.parse(model.mock.calls[0][0][1].content) as { dishes: number; categories: string[] }
    expect(facts.dishes).toBe(3)
    expect(facts.categories).toEqual(['Drinks (1)', 'Silog (2)'])
  })

  test('an off-catalog AI answer falls back to the menu rules', async () => {
    const { chooseLaunchDesign } = await import('@/lib/onboarding/design-step')
    const { RULE_REASONS } = await import('@/lib/onboarding/design-pick')
    const choice = await chooseLaunchDesign(fakeAdmin().client as never, 't1', ANSWERS, jest.fn(async () => '{"look":"menuboard"}'))
    expect(choice.source).toBe('rules')
    expect(choice.reason).toBe(RULE_REASONS[choice.look])
  })

  test('an AI that throws (no key, timeout) falls back to the menu rules, never fails', async () => {
    const { chooseLaunchDesign } = await import('@/lib/onboarding/design-step')
    const choice = await chooseLaunchDesign(fakeAdmin().client as never, 't1', ANSWERS, jest.fn(async () => { throw new Error('OPENROUTER_API_KEY is missing') }))
    expect(choice.source).toBe('rules')
  })

  test('an empty menu skips the AI and designs for the store type', async () => {
    const { chooseLaunchDesign } = await import('@/lib/onboarding/design-step')
    const { STORE_TYPES } = await import('@/lib/onboarding/store-type')
    const model = jest.fn(async () => '{"look":"kiosk"}')
    const choice = await chooseLaunchDesign(fakeAdmin({ categories: [], items: [] }).client as never, 't1', { ...ANSWERS, storeType: 'cafe' }, model)
    expect(model).not.toHaveBeenCalled()
    expect(choice).toMatchObject({ look: STORE_TYPES.cafe.look, source: 'rules' })
  })

  test('a menu read that fails is an error (the step retries), not a silent guess', async () => {
    const { chooseLaunchDesign } = await import('@/lib/onboarding/design-step')
    await expect(chooseLaunchDesign(fakeAdmin(undefined, 'menu_items').client as never, 't1', ANSWERS, jest.fn(async () => '')))
      .rejects.toThrow(/Menu items could not be read/)
  })
})
