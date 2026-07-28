/**
 * Where "out of stock" is allowed to disappear a dish, and where it is not.
 *
 * The storefront grid must now *show* an out-of-stock dish — that is the whole
 * feature. But the same flag is read by places that offer a dish rather than
 * list it: bundle slots, upsell suggestions, related items. Offering a customer
 * something they cannot buy is a worse bug than hiding it, so those stay
 * filtered. These are source-level guardrails for the same reason
 * `tenant-storefront-select.test.ts` is: the queries live inside async server
 * components, and the regression they protect against is a one-line edit.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('the storefront menu grid', () => {
  const source = read('src/app/[tenant]/menu/menu-server.tsx')

  /*
   * The grid query and the bundle-slot query are both `from('menu_items')`, so
   * the assertion has to be anchored to the grid's own projection rather than
   * to the table name.
   */
  it('fetches every dish, including the ones that are out of stock', () => {
    // The identifier also appears in the import, which is not a query — anchor
    // on the call itself so the assertion cannot pass by reading the wrong line.
    const gridQuery = source
      .split('\n')
      .find((line) => line.includes('select(MENU_ITEM_LIST_SELECT)'))

    expect(gridQuery).toBeDefined()
    expect(gridQuery).not.toContain("eq('is_available', true)")
  })

  it('still keeps out-of-stock dishes out of bundle slots', () => {
    const slotQuery = source.slice(source.indexOf('slot.category_id'))

    expect(slotQuery).toContain("eq('is_available', true)")
  })
})

describe('the product page reached by its own URL', () => {
  const source = read('src/components/customer/product-detail-content.tsx')

  /*
   * A card that will not open is not a guard — the product URL is shareable,
   * indexed, and reachable from an old cart link. Add to Cart and Buy Now both
   * have to know.
   */
  it('cannot add an out-of-stock dish to the cart', () => {
    expect(source).toContain('isMenuItemOrderable')
  })

  it('disables both order buttons, not just one', () => {
    const disabledGuards = source.match(/disabled=\{[^}]*isOrderable[^}]*\}/g) ?? []

    expect(disabledGuards.length).toBeGreaterThanOrEqual(2)
  })
})

describe('related dishes on the product page', () => {
  it('still only suggests dishes the customer can actually order', () => {
    expect(read('src/lib/product-detail-data.ts')).toContain("eq('is_available', true)")
  })
})
