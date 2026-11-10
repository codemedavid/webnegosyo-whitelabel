/**
 * The platform's Meta pixel belongs to the platform's marketing pages only.
 * In the root layout it fired on every merchant storefront, custom domain and
 * admin screen (about 73% of its events in Oct–Nov 2026 were diners).
 */
import { readFileSync } from 'fs'
import path from 'path'

const read = (file: string) => readFileSync(path.join(process.cwd(), file), 'utf8')

describe('Meta pixel scope', () => {
  it('is not in the root layout (every storefront and admin page renders it)', () => {
    const layout = read('src/app/layout.tsx')
    expect(layout).not.toMatch(/MetaPixelBootstrap|MarketingPixel|fbq/)
  })

  it.each([
    ['the homepage and /funnel', 'src/components/funnel/funnel-page.tsx'],
    ['the old landing page', 'src/components/landing/landing-page.tsx'],
    ['/checkout and its confirmation', 'src/app/checkout/layout.tsx'],
  ])('is on %s', (_name, file) => {
    expect(read(file)).toMatch(/<MarketingPixel \/>/)
  })

  it('is mounted nowhere under the tenant routes', () => {
    const { execSync } = jest.requireActual('child_process') as typeof import('child_process')
    const hits = execSync('git grep -l -E "MarketingPixel|MetaPixelBootstrap" -- "src/app/[[]tenant]" "src/components/customer" "src/components/admin" || true', {
      encoding: 'utf8',
    }).trim()
    expect(hits).toBe('')
  })
})
