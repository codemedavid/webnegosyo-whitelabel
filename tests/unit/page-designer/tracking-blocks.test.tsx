/**
 * The tracking page with a published Page Designer design: every block
 * renders from the page's live values, "Show when" follows the order status
 * (also as polls move it), block wording and tokens apply, and the editor's
 * samples follow its state switcher.
 */

import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'

import type { TrackingDashboardProps } from '@/components/customer/order-tracking/tracking-dashboard'
import { getStatusIndex } from '@/components/customer/order-tracking/status-steps'
import { sampleTrackingData, type TrackingPreviewStatus } from '@/lib/branding-studio/tracking-preview'
import type { HeroDesignV5 } from '@/lib/hero-builder/types'
import { isPageBlockWidget } from '@/lib/page-designer/design-blocks'
import { preparePageDesign } from '@/lib/page-designer/rules'
import { createStandardDesign } from '@/lib/page-designer/standard-designs'
import { PAGE_TEMPLATES } from '@/lib/page-designer/templates'
import { TRACKING_BLOCKS } from '@/lib/page-designer/blocks-tracking'
import { DEFAULT_TRACKING_OPTIONS } from '@/lib/tracking-style/keys'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))

// next/jest leaves static imports ahead of jest.mock: load the components lazily.
/* eslint-disable @typescript-eslint/no-require-imports -- lazy on purpose, see above */
const load = () => ({
  ...(require('@/components/customer/order-tracking/tracking-dashboard') as typeof import('@/components/customer/order-tracking/tracking-dashboard')),
  ...(require('@/components/hero-builder/renderer/hero-builder-renderer') as typeof import('@/components/hero-builder/renderer/hero-builder-renderer')),
  ...(require('@/components/hero-builder/renderer/page-runtime') as typeof import('@/components/hero-builder/renderer/page-runtime')),
  ...(require('@/components/page-designer/samples/tracking-samples') as typeof import('@/components/page-designer/samples/tracking-samples')),
})
/* eslint-enable @typescript-eslint/no-require-imports */

function propsFor(status: TrackingPreviewStatus, design: HeroDesignV5, extra: Partial<TrackingDashboardProps> = {}): TrackingDashboardProps {
  const data = sampleTrackingData({ status, loyalty: 'collecting', extras: ['pickup'] })
  return {
    storeName: 'Lola’s Kitchen',
    logoUrl: null,
    theme: {},
    options: DEFAULT_TRACKING_OPTIONS,
    storefrontLabels: { 'tracking.back': 'Menu please' },
    data,
    shortId: '07',
    currentIndex: getStatusIndex(status),
    placedLabel: '12:24 PM',
    prepPromise: null,
    isAlarmArmed: false,
    onArmAlarm: () => undefined,
    loyalty: <div>Stamp card here</div>,
    pickup: status === 'cancelled' ? null : <div>Pickup code here</div>,
    readyNotice: null,
    onAcknowledgeReady: () => undefined,
    onBack: () => undefined,
    designedPage: { design: preparePageDesign(design, 'tracking'), tenantSlug: 'lolas' },
    ...extra,
  }
}

function dashboard(props: TrackingDashboardProps): ReactElement {
  const { TrackingDashboard } = load()
  return <TrackingDashboard {...props} />
}

const template = (id: string) => PAGE_TEMPLATES.tracking.find((t) => t.id === id)!.build()

/** The standard design with one block's wording replaced. */
function withTexts(design: HeroDesignV5, blockId: string, texts: Record<string, string>): HeroDesignV5 {
  return {
    ...design,
    sections: design.sections.map((s) => ({
      ...s,
      columns: s.columns.map((c) => ({
        ...c,
        widgets: c.widgets.map((w) => (isPageBlockWidget(w) && w.content.block === blockId ? { ...w, content: { ...w.content, texts } } : w)),
      })),
    })),
  }
}

describe('designed tracking page (storefront)', () => {
  it('renders every block of the standard design from the live values', () => {
    render(dashboard(propsFor('preparing', createStandardDesign('tracking'))))
    expect(screen.getByText('Order #07')).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(screen.getByText('Hi Maria!')).toBeInTheDocument()
    expect(screen.getByText('Cooking up your order')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ring me when my order is ready/ })).toBeInTheDocument()
    expect(screen.getByText('Stamp card here')).toBeInTheDocument()
    expect(screen.getByText('Pickup code here')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Order progress' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Order summary' })).toBeInTheDocument()
    // The block's text slot shares the store's Branding Studio label.
    expect(screen.getByRole('button', { name: 'Menu please' })).toBeInTheDocument()
  })

  it('keeps the themed root around the design', () => {
    const { container } = render(dashboard(propsFor('preparing', createStandardDesign('tracking'))))
    expect(container.firstElementChild?.getAttribute('data-branding-scope')).toBe('tracking/page')
    expect(container.querySelector('main')).toBeNull()
  })

  it('re-words the hard-coded lines through block texts and tokens', () => {
    const design = withTexts(
      withTexts(createStandardDesign('tracking'), 'tracking.status', { greeting: 'Kumusta {name}', placed: 'Ordered' }),
      'tracking.summary',
      { total: 'Grand total', title: 'Order {order_number}' },
    )
    render(dashboard(propsFor('preparing', design)))
    expect(screen.getByText('Kumusta Maria')).toBeInTheDocument()
    expect(screen.getByText('Ordered 12:24 PM')).toBeInTheDocument()
    expect(screen.getByText('Grand total')).toBeInTheDocument()
    expect(screen.getAllByText('Order #07').length).toBeGreaterThanOrEqual(2)
  })

  it('greets a guest with the no-name line', () => {
    const props = propsFor('preparing', createStandardDesign('tracking'))
    render(dashboard({ ...props, data: { ...props.data, customerName: 'walk-in' } }))
    expect(screen.getByText('Hi there!')).toBeInTheDocument()
  })

  it('shows "Show when" lines only in their status, and follows a poll that moves it', () => {
    const friendly = template('friendly')
    const { rerender } = render(dashboard(propsFor('preparing', friendly)))
    expect(screen.getByText('Our kitchen is cooking it fresh. Hang tight!')).toBeInTheDocument()
    expect(screen.queryByText('It’s ready! Come say hi at the counter.')).not.toBeInTheDocument()

    rerender(dashboard(propsFor('ready', friendly)))
    expect(screen.getByText('It’s ready! Come say hi at the counter.')).toBeInTheDocument()
    expect(screen.queryByText('Our kitchen is cooking it fresh. Hang tight!')).not.toBeInTheDocument()
    expect(screen.getByText('Your order is ready!')).toBeInTheDocument()
    // No "Ring me" once the order is ready (as on the standard page).
    expect(screen.queryByRole('button', { name: /Ring me/ })).not.toBeInTheDocument()
  })

  it('hides the timeline and pickup code on a cancelled order', () => {
    render(dashboard(propsFor('cancelled', createStandardDesign('tracking'))))
    expect(screen.getByText('Order cancelled')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Order progress' })).not.toBeInTheDocument()
    expect(screen.queryByText('Pickup code here')).not.toBeInTheDocument()
  })

  it('keeps the ready alert outside the design', () => {
    render(dashboard(propsFor('ready', createStandardDesign('tracking'), { readyNotice: { title: 'Order ready!', body: 'Come get it' }, shouldFocusAlert: false })))
    expect(screen.getByText('Order ready!')).toBeInTheDocument()
  })

  it('still renders the status block when a stored design left it out', () => {
    const empty: HeroDesignV5 = { ...createStandardDesign('tracking'), sections: [] }
    render(dashboard(propsFor('preparing', empty)))
    expect(screen.getByText('Cooking up your order')).toBeInTheDocument()
  })
})

describe('tracking blocks in the Page Designer editor', () => {
  function renderSample(state: string) {
    const { HeroBuilderRenderer, PageRuntimeProvider, TRACKING_SAMPLE_BLOCKS } = load()
    const runtime = {
      page: 'tracking' as const,
      state,
      tokens: { store: 'Lola’s Kitchen', name: 'Maria', order_number: '#07', order_type: 'Pickup', total: '₱485.00' },
      labels: {},
      blocks: TRACKING_SAMPLE_BLOCKS,
    }
    return render(
      <PageRuntimeProvider value={runtime}>
        <HeroBuilderRenderer design={createStandardDesign('tracking')} isEditor />
      </PageRuntimeProvider>,
    )
  }

  it('has a sample for every tracking block', () => {
    const { TRACKING_SAMPLE_BLOCKS } = load()
    expect(Object.keys(TRACKING_SAMPLE_BLOCKS).sort()).toEqual(TRACKING_BLOCKS.map((b) => b.id).sort())
  })

  it('follows the editor’s state switcher', () => {
    const { unmount } = renderSample('preparing')
    expect(screen.getByText('Cooking up your order')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ring me/ })).toBeInTheDocument()
    unmount()

    renderSample('ready')
    expect(screen.getByText('Your order is ready!')).toBeInTheDocument()
    expect(screen.getByText('“Ring me” shows while the order is being made.')).toBeInTheDocument()
  })

  it('paints the sample order (no placeholders)', () => {
    renderSample('preparing')
    expect(screen.queryByText(/shows here$/)).not.toBeInTheDocument()
    expect(screen.getByText('Chicken Inasal')).toBeInTheDocument()
    expect(screen.getByText('Order #07')).toBeInTheDocument()
  })
})
