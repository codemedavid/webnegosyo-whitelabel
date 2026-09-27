/**
 * A storefront pack with a fixed bottom bar (BiteSpeed's tab bar and "View
 * order" bar) reserves space with `--storefront-bottom-inset`. Everything
 * else pinned to the bottom of the page must sit above it, and with the
 * variable unset (every legacy storefront) must land exactly where it did.
 */
import { readFileSync } from 'fs'
import path from 'path'

const read = (file: string) => readFileSync(path.join(process.cwd(), file), 'utf8')

describe('the bottom inset', () => {
  it('lifts both forms of the active-order banner above a pack bar', () => {
    const source = read('src/components/customer/active-order-banner.tsx')
    expect(source).not.toMatch(/fixed bottom-6/)
    // Both forms share one bottom class, and both of its positions (resting,
    // and raised above the senior-mode cart bar) carry the inset.
    expect(source.match(/fixed \$\{bottomClass\}/g)).toHaveLength(2)
    expect(source).toContain("'bottom-[calc(1.5rem+var(--storefront-bottom-inset,0px))]'")
    expect(source).toContain("'bottom-[calc(8rem+var(--storefront-bottom-inset,0px))]'")
  })

  it('pads the site footer so its last line is not hidden behind a pack bar', () => {
    expect(read('src/components/customer/site-footer.tsx')).toMatch(/var\(--storefront-bottom-inset, 0px\)/)
  })
})
