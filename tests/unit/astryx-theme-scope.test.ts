/**
 * Astryx must not repaint the rest of the admin.
 *
 * `@astryxdesign/theme-neutral/theme.css` declares `:root { color-scheme:
 * light dark }` — unscoped, on the document root. On a machine set to dark
 * mode that flips the browser's *default* text colour for the whole page, so
 * every element without an explicit colour (the inventory `<h1>`, its
 * description, plain table text) renders near-white on the admin's white
 * surface. The page looked blank.
 *
 * The admin has no dark mode: it is a light-only surface with an opt-in `.dark`
 * class for specific panels. So the document is pinned to light, and the Astryx
 * region is pinned with it rather than left on `system`.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..', '..')

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), 'utf8')
}

describe('document colour scheme', () => {
  const globals = read('src/app/globals.css')

  it('pins the document to light so a dark OS cannot repaint unstyled text', () => {
    // Bound on the `.dark {` rule, not the `@custom-variant dark` on line 4.
    const rootBlock = globals.slice(globals.indexOf(':root {'), globals.indexOf('.dark {'))

    expect(rootBlock).toMatch(/color-scheme:\s*light\s*;/)
  })
})

describe('AstryxRegion', () => {
  const region = read('src/components/admin/inventory/astryx-region.tsx')

  it('pins the region to light rather than following the OS', () => {
    // `system` resolves Astryx's own tokens to dark on a dark Mac, which is
    // wrong for a surface that is always light.
    expect(region).toMatch(/mode="light"/)
    expect(region).not.toMatch(/mode="system"/)
  })

  it('still refuses the page-wide reset stylesheet', () => {
    // Match the import, not the comment that explains why there isn't one.
    expect(region).not.toMatch(/^import ['"]@astryxdesign\/core\/reset\.css/m)
  })
})
