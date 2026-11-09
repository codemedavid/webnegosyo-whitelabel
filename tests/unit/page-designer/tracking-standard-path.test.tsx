/**
 * The tracking page WITHOUT a published design must render exactly as it did
 * before the Page Designer: same parts, same order, same classes. The
 * snapshots were recorded from the dashboard before it learned to render a
 * design (2026-11-04); a diff here means the standard page changed.
 */

import { render } from '@testing-library/react'

import { TrackingDashboard, type TrackingDashboardProps } from '@/components/customer/order-tracking/tracking-dashboard'
import { getStatusIndex } from '@/components/customer/order-tracking/status-steps'
import { sampleTrackingData, type TrackingPreviewState } from '@/lib/branding-studio/tracking-preview'
import { DEFAULT_TRACKING_OPTIONS, type TrackingOptions } from '@/lib/tracking-style/keys'

jest.mock('framer-motion', () => {
  const React = jest.requireActual<typeof import('react')>('react')
  const strip = ({ initial, animate, transition, ...rest }: Record<string, unknown>) => {
    void initial; void animate; void transition
    return rest
  }
  const motion = new Proxy({}, {
    get: (_target, tag: string) => (props: Record<string, unknown>) => React.createElement(tag, strip(props)),
  })
  return { motion, useReducedMotion: () => true }
})

function propsFor(state: TrackingPreviewState, options: Partial<TrackingOptions> = {}, extra: Partial<TrackingDashboardProps> = {}): TrackingDashboardProps {
  const data = sampleTrackingData(state)
  return {
    storeName: 'Lola’s Kitchen',
    logoUrl: null,
    theme: {},
    options: { ...DEFAULT_TRACKING_OPTIONS, ...options },
    storefrontLabels: { 'tracking.back': 'Menu please' },
    data,
    shortId: '07',
    currentIndex: getStatusIndex(data.status),
    placedLabel: '12:24 PM',
    prepPromise: { headline: 'Ready by 12:42 PM', detail: 'About 12 minutes' } as TrackingDashboardProps['prepPromise'],
    isAlarmArmed: false,
    onArmAlarm: () => undefined,
    loyalty: <div data-testid="loyalty-slot">card</div>,
    loyaltyNotice: <p data-testid="loyalty-notice">notice</p>,
    pickup: state.extras.includes('pickup') ? <div data-testid="pickup-slot">qr</div> : null,
    readyNotice: null,
    onAcknowledgeReady: () => undefined,
    onBack: () => undefined,
    ...extra,
  }
}

const CASES: ReadonlyArray<[string, TrackingDashboardProps]> = [
  ['preparing, loyalty on top', propsFor({ status: 'preparing', loyalty: 'collecting', extras: [] })],
  ['pending, armed, pickup + scheduled, loyalty at the bottom', propsFor(
    { status: 'pending', loyalty: 'collecting', extras: ['pickup', 'scheduled'] },
    { loyalty_position: 'bottom' } as Partial<TrackingOptions>,
    { isAlarmArmed: true },
  )],
  ['ready, no timeline, no live badge', propsFor(
    { status: 'ready', loyalty: 'collecting', extras: [] },
    { show_timeline: false, show_live_badge: false } as Partial<TrackingOptions>,
    { readyNotice: { title: 'Ready!', body: 'Come get it' }, shouldFocusAlert: false },
  )],
  ['cancelled', propsFor({ status: 'cancelled', loyalty: 'collecting', extras: [] })],
  ['delivered, guest', propsFor({ status: 'delivered', loyalty: 'collecting', extras: [] }, {}, {
    data: { ...sampleTrackingData({ status: 'delivered', loyalty: 'collecting', extras: [] }), customerName: 'walk-in' },
  })],
]

describe('tracking page without a design (standard path)', () => {
  it.each(CASES)('%s renders exactly as before', (_name, props) => {
    const { container } = render(<TrackingDashboard {...props} />)
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('keeps today’s part order', () => {
    const { container } = render(<TrackingDashboard {...CASES[0][1]} />)
    const scopes = [...container.querySelectorAll('[data-branding-scope]')].map((el) => el.getAttribute('data-branding-scope'))
    expect(scopes).toEqual(['tracking/page', 'tracking/header', 'tracking/hero', 'tracking/ring', 'tracking/timeline', 'tracking/summary'])
    const text = container.textContent ?? ''
    expect(text.indexOf('notice')).toBeLessThan(text.indexOf('card'))
    expect(text.indexOf('card')).toBeLessThan(text.indexOf('Progress'))
    expect(text).toContain('Menu please')
  })
})
