/**
 * Design registries are the single source of truth for every selectable
 * storefront design (page layout, card, header, cart, checkout). The Branding
 * Studio pickers, the runtime dispatchers and the id resolver must all agree
 * with them — a design that can be picked but not rendered silently shows the
 * default instead, which is how four page layouts and six cards once shipped
 * as selectable-but-dead.
 */
import { BRANDING_FIELD_INDEX } from '@/lib/branding-registry'
import { CARD_TEMPLATE_IDS, DEFAULT_CARD_TEMPLATE } from '@/lib/card-templates'
import { PAGE_LAYOUT_IDS, DEFAULT_PAGE_LAYOUT } from '@/lib/page-layouts'
import { HEADER_TEMPLATE_IDS, DEFAULT_HEADER_TEMPLATE } from '@/lib/header-templates'
import { CART_TEMPLATE_IDS, DEFAULT_CART_TEMPLATE } from '@/lib/cart-templates'
import { CHECKOUT_TEMPLATE_IDS, DEFAULT_CHECKOUT_TEMPLATE } from '@/lib/checkout-templates'
import { pickDesignId } from '@/lib/design-ids'

const REGISTRIES = [
  { field: 'page_layout', ids: PAGE_LAYOUT_IDS, fallback: DEFAULT_PAGE_LAYOUT },
  { field: 'card_template', ids: CARD_TEMPLATE_IDS, fallback: DEFAULT_CARD_TEMPLATE },
  { field: 'header_template', ids: HEADER_TEMPLATE_IDS, fallback: DEFAULT_HEADER_TEMPLATE },
  { field: 'cart_template', ids: CART_TEMPLATE_IDS, fallback: DEFAULT_CART_TEMPLATE },
  { field: 'checkout_template', ids: CHECKOUT_TEMPLATE_IDS, fallback: DEFAULT_CHECKOUT_TEMPLATE },
] as const

describe.each(REGISTRIES)('the $field registry', ({ field, ids, fallback }) => {
  it('offers exactly the registry ids, in registry order, in the Branding Studio', () => {
    expect(BRANDING_FIELD_INDEX[field].options).toEqual([...ids])
  })

  it('defaults the Studio picker to the registry default', () => {
    expect(BRANDING_FIELD_INDEX[field].default).toBe(fallback)
  })

  it('has unique ids that include its default', () => {
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain(fallback)
  })

  it('resolves every registered id to itself', () => {
    for (const id of ids) expect(pickDesignId(id, ids, fallback)).toBe(id)
  })

  it.each([null, undefined, '', 'garbage', 42])('resolves %p to the default', (value) => {
    expect(pickDesignId(value, ids, fallback)).toBe(fallback)
  })
})

describe('runtime dispatchers', () => {
  it('give every card, header, cart and checkout id its own component', async () => {
    const { getCardTemplateComponent } = await import('@/components/customer/card-templates')
    const { getHeaderTemplateComponent } = await import('@/components/customer/header-templates')
    const { getCartTemplateComponent } = await import('@/components/customer/cart-templates')
    const { getCheckoutTemplateComponent } = await import('@/components/customer/checkout-templates')
    const dispatchers = [
      [CARD_TEMPLATE_IDS, getCardTemplateComponent],
      [HEADER_TEMPLATE_IDS, getHeaderTemplateComponent],
      [CART_TEMPLATE_IDS, getCartTemplateComponent],
      [CHECKOUT_TEMPLATE_IDS, getCheckoutTemplateComponent],
    ] as const
    for (const [ids, get] of dispatchers) {
      const components = ids.map((id) => (get as (id: string) => unknown)(id))
      expect(new Set(components).size).toBe(ids.length)
    }
  })

  it('give every page layout its own component', async () => {
    const { getMenuLayoutComponent } = await import('@/components/customer/layouts')
    const components = PAGE_LAYOUT_IDS.map((id) => getMenuLayoutComponent(id))
    expect(new Set(components).size).toBe(PAGE_LAYOUT_IDS.length)
  })

  it('fall back to the default design for an unknown id', async () => {
    const { getCardTemplateComponent } = await import('@/components/customer/card-templates')
    const { getMenuLayoutComponent } = await import('@/components/customer/layouts')
    expect(getCardTemplateComponent('garbage' as never)).toBe(getCardTemplateComponent('classic'))
    expect(getMenuLayoutComponent('garbage' as never)).toBe(getMenuLayoutComponent('default'))
  })
})
