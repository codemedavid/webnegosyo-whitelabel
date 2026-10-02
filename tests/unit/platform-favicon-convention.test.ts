import { existsSync, readFileSync } from 'fs'
import path from 'path'

// A `favicon.ico` under src/app is a Next.js file convention: it is injected
// into EVERY route's <head> with a declared size, and browsers prefer that
// sized icon over a tenant's (unsized) logo icon — so storefront tabs showed
// the platform icon instead of the merchant's logo. The platform favicon must
// live in public/ and be declared through root-layout metadata, which a tenant
// layout's `icons` replaces.

const ROOT = path.resolve(__dirname, '../..')

describe('platform favicon placement', () => {
  it('does not use the app-directory favicon file convention', () => {
    expect(existsSync(path.join(ROOT, 'src/app/favicon.ico'))).toBe(false)
  })

  it('serves the platform favicon from public/', () => {
    expect(existsSync(path.join(ROOT, 'public/favicon.ico'))).toBe(true)
  })

  it('declares the platform favicon in root layout metadata', () => {
    const layout = readFileSync(path.join(ROOT, 'src/app/layout.tsx'), 'utf8')
    expect(layout).toMatch(/icons:\s*['"]\/favicon\.ico['"]/)
  })
})
