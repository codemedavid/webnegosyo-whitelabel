import {
  CATEGORY_ANCHOR_PREFIX,
  MENU_ANCHOR,
  linkTargetHref,
  parseLinkTarget,
  targetElementId,
} from '@/lib/hero-builder/link-target'

describe('parseLinkTarget', () => {
  it('reads the menu anchor as the menu', () => {
    expect(parseLinkTarget('#storefront-menu')).toEqual({ type: 'menu' })
  })

  it('reads a category anchor as that category', () => {
    expect(parseLinkTarget('#category-3f2a-9b')).toEqual({ type: 'category', categoryId: '3f2a-9b' })
  })

  it('reads a product anchor as that product', () => {
    expect(parseLinkTarget('#product-abc_123')).toEqual({ type: 'product', itemId: 'abc_123' })
  })

  it('reads any other in-page anchor as a plain anchor', () => {
    expect(parseLinkTarget('#about-us')).toEqual({ type: 'anchor', anchor: 'about-us' })
  })

  it('treats external, relative and contact links as URLs', () => {
    expect(parseLinkTarget('https://x.com')).toEqual({ type: 'url', href: 'https://x.com/' })
    expect(parseLinkTarget('/about')).toEqual({ type: 'url', href: '/about' })
    expect(parseLinkTarget('tel:+639171234567')).toEqual({ type: 'url', href: 'tel:+639171234567' })
  })

  it('refuses unsafe, empty and malformed values', () => {
    expect(parseLinkTarget('javascript:alert(1)')).toEqual({ type: 'none' })
    expect(parseLinkTarget('')).toEqual({ type: 'none' })
    expect(parseLinkTarget('#')).toEqual({ type: 'none' })
    expect(parseLinkTarget(undefined)).toEqual({ type: 'none' })
    expect(parseLinkTarget(42)).toEqual({ type: 'none' })
  })

  it('does not treat an empty or odd id as a category or product', () => {
    expect(parseLinkTarget('#category-')).toEqual({ type: 'anchor', anchor: 'category-' })
    expect(parseLinkTarget('#product-a.b')).toEqual({ type: 'anchor', anchor: 'product-a.b' })
  })
})

describe('linkTargetHref', () => {
  it('round-trips every in-store target', () => {
    const targets = [
      { type: 'menu' as const },
      { type: 'category' as const, categoryId: 'c-1' },
      { type: 'product' as const, itemId: 'i-1' },
      { type: 'anchor' as const, anchor: 'story' },
    ]
    for (const target of targets) {
      expect(parseLinkTarget(linkTargetHref(target))).toEqual(target)
    }
  })

  it('writes URLs as given and none as empty', () => {
    expect(linkTargetHref({ type: 'url', href: 'https://x.com/' })).toBe('https://x.com/')
    expect(linkTargetHref({ type: 'none' })).toBe('')
  })
})

describe('targetElementId', () => {
  it('names the element each in-page target scrolls to', () => {
    expect(targetElementId({ type: 'menu' })).toBe(MENU_ANCHOR)
    expect(targetElementId({ type: 'category', categoryId: 'c-1' })).toBe('category-c-1')
    expect(targetElementId({ type: 'anchor', anchor: 'story' })).toBe('story')
    expect(targetElementId({ type: 'product', itemId: 'i-1' })).toBeNull()
    expect(targetElementId({ type: 'url', href: '/x' })).toBeNull()
  })

  it('uses the same category section id as the scroll-based menu layouts', async () => {
    const { categorySectionId } = await import('@/hooks/use-category-scroll-spy')
    expect(`${CATEGORY_ANCHOR_PREFIX}abc`).toBe(categorySectionId('abc'))
  })
})

describe('buildLinkCatalog', () => {
  it('lists categories and products in menu order, products grouped by category', async () => {
    // Arrange
    const { buildLinkCatalog } = await import('@/lib/hero-builder/link-catalog')
    const categories = [
      { id: 'drinks', name: 'Drinks', order: 2 },
      { id: 'mains', name: 'Mains', order: 1 },
    ]
    const items = [
      { id: 'tea', name: 'Tea', category_id: 'drinks', order: 1 },
      { id: 'adobo', name: 'Adobo', category_id: 'mains', order: 2 },
      { id: 'sinigang', name: 'Sinigang', category_id: 'mains', order: 1 },
    ]

    // Act
    const catalog = buildLinkCatalog(categories, items)

    // Assert
    expect(catalog.categories).toEqual([{ id: 'mains', name: 'Mains' }, { id: 'drinks', name: 'Drinks' }])
    expect(catalog.products.map((p) => p.id)).toEqual(['sinigang', 'adobo', 'tea'])
    expect(catalog.products[2]).toEqual({ id: 'tea', name: 'Tea', categoryName: 'Drinks' })
  })
})
