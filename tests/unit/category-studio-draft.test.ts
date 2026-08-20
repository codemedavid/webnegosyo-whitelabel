/**
 * Branding Studio "Menu Layout" surface — category draft logic.
 *
 * The studio streams an unsaved category draft (`__categoryDraft`) into the
 * preview iframe; the storefront applies it over the server-provided
 * categories so arrangement + per-category settings update live. On Publish,
 * the draft turns into a reorder call plus per-category update inputs.
 */
import {
  applyCategoryDraft,
  buildCategoryPublishPlan,
  type CategoryStudioDraft,
} from '@/lib/category-studio'
import type { Category } from '@/types/database'

const makeCategory = (id: string, overrides: Partial<Category> = {}): Category =>
  ({
    id,
    tenant_id: 't-1',
    name: `Category ${id}`,
    description: 'A fine selection',
    icon: '🍔',
    icon_color: '#ff0000',
    order: 0,
    is_active: true,
    display_layout: 'grid',
    default_addons: [{ id: 'a1', name: 'Cheese', price: 10 }],
    created_at: '',
    updated_at: '',
    ...overrides,
  }) as Category

const categories = [
  makeCategory('burgers', { order: 0 }),
  makeCategory('drinks', { order: 1 }),
  makeCategory('desserts', { order: 2 }),
]

describe('applyCategoryDraft', () => {
  it('returns the categories untouched for a null draft', () => {
    expect(applyCategoryDraft(categories, null)).toEqual(categories)
  })

  it('returns the categories untouched for an empty draft', () => {
    expect(applyCategoryDraft(categories, {})).toEqual(categories)
  })

  it('reorders categories to match draft.order', () => {
    // Arrange
    const draft: CategoryStudioDraft = { order: ['drinks', 'desserts', 'burgers'] }

    // Act
    const result = applyCategoryDraft(categories, draft)

    // Assert
    expect(result.map((c) => c.id)).toEqual(['drinks', 'desserts', 'burgers'])
  })

  it('keeps categories missing from draft.order at the end in their saved order', () => {
    const draft: CategoryStudioDraft = { order: ['desserts'] }
    const result = applyCategoryDraft(categories, draft)
    expect(result.map((c) => c.id)).toEqual(['desserts', 'burgers', 'drinks'])
  })

  it('ignores unknown ids in draft.order', () => {
    const draft: CategoryStudioDraft = { order: ['ghost', 'drinks', 'burgers', 'desserts'] }
    const result = applyCategoryDraft(categories, draft)
    expect(result.map((c) => c.id)).toEqual(['drinks', 'burgers', 'desserts'])
  })

  it('applies display_layout and card_template overrides', () => {
    const draft: CategoryStudioDraft = {
      overrides: {
        burgers: { display_layout: 'horizontal_scroll', card_template: 'storefront' },
      },
    }
    const result = applyCategoryDraft(categories, draft)
    expect(result[0].display_layout).toBe('horizontal_scroll')
    expect(result[0].card_template).toBe('storefront')
    // Untouched categories keep their values.
    expect(result[1].display_layout).toBe('grid')
  })

  it('treats an empty-string card_template override as clearing back to inherit', () => {
    const withOverride = [makeCategory('burgers', { card_template: 'neon' })]
    const draft: CategoryStudioDraft = { overrides: { burgers: { card_template: '' } } }
    const result = applyCategoryDraft(withOverride, draft)
    expect(result[0].card_template).toBeNull()
  })

  it('does not mutate the input categories', () => {
    const draft: CategoryStudioDraft = {
      order: ['desserts', 'burgers', 'drinks'],
      overrides: { burgers: { display_layout: 'horizontal_scroll' } },
    }
    const snapshot = JSON.parse(JSON.stringify(categories))
    applyCategoryDraft(categories, draft)
    expect(categories).toEqual(snapshot)
  })
})

describe('buildCategoryPublishPlan', () => {
  it('returns an empty plan when nothing changed', () => {
    const plan = buildCategoryPublishPlan(categories, {})
    expect(plan.orderedIds).toBeNull()
    expect(plan.updates).toEqual([])
  })

  it('returns null orderedIds when draft.order matches the saved order', () => {
    const plan = buildCategoryPublishPlan(categories, {
      order: ['burgers', 'drinks', 'desserts'],
    })
    expect(plan.orderedIds).toBeNull()
  })

  it('returns the full ordered id list when the order changed', () => {
    const plan = buildCategoryPublishPlan(categories, {
      order: ['drinks', 'burgers', 'desserts'],
    })
    expect(plan.orderedIds).toEqual(['drinks', 'burgers', 'desserts'])
  })

  it('builds a full CategoryInput per modified category, preserving saved fields', () => {
    const plan = buildCategoryPublishPlan(categories, {
      overrides: { burgers: { card_template: 'storefront' } },
    })
    expect(plan.updates).toHaveLength(1)
    const update = plan.updates[0]
    expect(update.id).toBe('burgers')
    // Full input so updateCategory's schema defaults cannot clobber columns.
    expect(update.input).toMatchObject({
      name: 'Category burgers',
      description: 'A fine selection',
      icon: '🍔',
      icon_color: '#ff0000',
      is_active: true,
      display_layout: 'grid',
      card_template: 'storefront',
      default_addons: [{ id: 'a1', name: 'Cheese', price: 10 }],
    })
  })

  it('skips overrides that match the saved value', () => {
    const plan = buildCategoryPublishPlan(categories, {
      overrides: {
        burgers: { display_layout: 'grid' },
        drinks: { display_layout: 'horizontal_scroll' },
      },
    })
    expect(plan.updates.map((u) => u.id)).toEqual(['drinks'])
  })

  it('maps an empty-string card_template to null (clear override)', () => {
    const saved = [makeCategory('burgers', { card_template: 'neon' })]
    const plan = buildCategoryPublishPlan(saved, {
      overrides: { burgers: { card_template: '' } },
    })
    expect(plan.updates).toHaveLength(1)
    expect(plan.updates[0].input.card_template).toBeNull()
  })
})
