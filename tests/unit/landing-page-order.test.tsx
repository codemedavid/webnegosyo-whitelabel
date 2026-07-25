/**
 * Landing page narrative order.
 *
 * J9 — As a visitor, I want the page to build its case in order (problem →
 *      what you get → how it works → proof → price), so I understand the offer
 *      before I am asked to pay.
 *
 * The 3D hero canvas is WebGL and cannot mount in jsdom, so it is mocked out.
 * Everything below the hero is real.
 */
import { render } from '@testing-library/react'
import { LandingPage } from '@/components/landing/landing-page'

// `next/dynamic` resolves its loader asynchronously, which would settle outside
// `act()` after the assertions run. Resolve it to nothing synchronously instead.
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => function MockedHeroCanvas() {
    return null
  },
}))

/** Section ids in the order the page should present them. */
const EXPECTED_ORDER = [
  'problem',
  'what-you-get',
  'how-it-works',
  'upsells',
  'proof',
  'pricing',
  'faq',
] as const

describe('J9 — the page argues in a deliberate order', () => {
  it('renders every narrative section exactly once', () => {
    const { container } = render(<LandingPage />)

    EXPECTED_ORDER.forEach((id) => {
      expect(container.querySelectorAll(`#${id}`)).toHaveLength(1)
    })
  })

  it('presents the problem before the offer, and the offer before the price', () => {
    const { container } = render(<LandingPage />)

    const positions = EXPECTED_ORDER.map((id) => {
      const element = container.querySelector(`#${id}`)
      if (element === null) throw new Error(`missing section: #${id}`)
      return [...container.querySelectorAll('section')].indexOf(element as HTMLElement)
    })

    const sorted = [...positions].sort((a, b) => a - b)

    expect(positions).toEqual(sorted)
  })
})
