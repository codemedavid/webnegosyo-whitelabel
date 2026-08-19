/**
 * Per-category card template resolution.
 *
 * A category may carry its own `card_template` override; when unset (or set
 * to an unknown value) the tenant-wide template applies.
 */
import { resolveCategoryCardTemplate } from '@/lib/category-card-template'
import type { Category } from '@/types/database'

const category = (overrides: Partial<Category> = {}): Category =>
  ({
    id: 'cat-1',
    tenant_id: 't-1',
    name: 'Burgers',
    order: 0,
    is_active: true,
    display_layout: 'grid',
    created_at: '',
    updated_at: '',
    ...overrides,
  }) as Category

describe('resolveCategoryCardTemplate', () => {
  it('returns the category override when it is a valid template', () => {
    // Arrange
    const cat = category({ card_template: 'storefront' })

    // Act
    const result = resolveCategoryCardTemplate(cat, 'classic')

    // Assert
    expect(result).toBe('storefront')
  })

  it('falls back to the tenant template when the category has no override', () => {
    expect(resolveCategoryCardTemplate(category(), 'neon')).toBe('neon')
  })

  it('falls back to the tenant template when the override is null', () => {
    const cat = category({ card_template: null as unknown as string })
    expect(resolveCategoryCardTemplate(cat, 'glass')).toBe('glass')
  })

  it('falls back to the tenant template when the override is not a known template', () => {
    const cat = category({ card_template: 'not-a-template' })
    expect(resolveCategoryCardTemplate(cat, 'elegant')).toBe('elegant')
  })

  it('falls back to the default template when neither category nor tenant set one', () => {
    expect(resolveCategoryCardTemplate(category(), undefined)).toBe('classic')
  })

  it('handles a missing category (uncategorized pseudo-section)', () => {
    expect(resolveCategoryCardTemplate(undefined, 'bold')).toBe('bold')
  })
})
