import { planStoreLink } from '@/storefront/catalog/store-link-plan'

const items = [{ id: 'latte', name: 'Latte' }, { id: 'mocha', name: 'Mocha' }]

function plan(target: Parameters<typeof planStoreLink>[0], present: string[] = []) {
  return planStoreLink(target, {
    hasElement: (id) => present.includes(id),
    categoryIds: ['coffee', 'pastry'],
    items,
  })
}

describe('planStoreLink', () => {
  it('scrolls to the menu', () => {
    expect(plan({ type: 'menu' })).toEqual({ kind: 'scroll-menu' })
  })

  it('scrolls straight to a category section the layout already renders', () => {
    expect(plan({ type: 'category', categoryId: 'coffee' }, ['category-coffee'])).toEqual({
      kind: 'scroll-to',
      elementId: 'category-coffee',
    })
  })

  it('switches a tabbed layout to the category when its section is not on the page', () => {
    expect(plan({ type: 'category', categoryId: 'pastry' })).toEqual({ kind: 'show-category', categoryId: 'pastry' })
  })

  it('falls back to the menu for a category that is no longer on the menu', () => {
    expect(plan({ type: 'category', categoryId: 'gone' })).toEqual({ kind: 'scroll-menu' })
  })

  it('opens a product that is on the menu', () => {
    expect(plan({ type: 'product', itemId: 'mocha' })).toEqual({ kind: 'open-product', item: items[1] })
  })

  it('reports a product that is no longer on the menu', () => {
    expect(plan({ type: 'product', itemId: 'gone' })).toEqual({ kind: 'missing-product' })
  })

  it('scrolls to a hero section anchor, and ignores one that is not on the page', () => {
    expect(plan({ type: 'anchor', anchor: 'story' }, ['story'])).toEqual({ kind: 'scroll-to', elementId: 'story' })
    expect(plan({ type: 'anchor', anchor: 'story' })).toEqual({ kind: 'ignore' })
  })
})
