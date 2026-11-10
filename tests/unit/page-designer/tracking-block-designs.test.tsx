/**
 * Order-tracking block designs and colours (Page Designer). Every design of
 * every block renders (the status always shows), an unknown stored design
 * reads as the block's original look, "Same as the Look tab" follows the
 * store's tracking_style, and a block colour re-publishes only that block's
 * `--trk-*` variables, resolved exactly like a store-wide change.
 */

import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'

import type { TrackingDashboardProps } from '@/components/customer/order-tracking/tracking-dashboard'
import { getStatusIndex } from '@/components/customer/order-tracking/status-steps'
import { buildTrackingTheme } from '@/components/customer/order-tracking/tracking-theme'
import { sampleTrackingData, type TrackingPreviewStatus } from '@/lib/branding-studio/tracking-preview'
import { getTenantBranding } from '@/lib/branding-utils'
import type { HeroDesignV5 } from '@/lib/hero-builder/types'
import { TRACKING_BLOCKS } from '@/lib/page-designer/blocks-tracking'
import { isPageBlockWidget } from '@/lib/page-designer/design-blocks'
import { preparePageDesign } from '@/lib/page-designer/rules'
import { createStandardDesign } from '@/lib/page-designer/standard-designs'
import {
  blockTrackingLook,
  blockTrackingVars,
  TRACKING_COLOR_KNOBS,
  trackingChoice,
  trackingColorOverrides,
  withBlockLook,
} from '@/lib/page-designer/tracking-colors'
import { DEFAULT_TRACKING_OPTIONS, TRACKING_COLOR_KEYS, readTrackingStyle, type TrackingStyle } from '@/lib/tracking-style/keys'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))

// next/jest leaves static imports ahead of jest.mock: load the components lazily.
/* eslint-disable @typescript-eslint/no-require-imports -- lazy on purpose, see above */
const load = () => ({
  ...(require('@/components/customer/order-tracking/tracking-dashboard') as typeof import('@/components/customer/order-tracking/tracking-dashboard')),
})
/* eslint-enable @typescript-eslint/no-require-imports */

const BRANDING = getTenantBranding({ primary_color: '#e4572e' })
const PLAIN_STYLE: TrackingStyle = { colors: {}, options: DEFAULT_TRACKING_OPTIONS }

type Options = Record<string, string | boolean>

/** The standard design with some blocks' options replaced. */
function withOptions(byBlock: Record<string, Options>): HeroDesignV5 {
  const design = createStandardDesign('tracking')
  return {
    ...design,
    sections: design.sections.map((s) => ({
      ...s,
      columns: s.columns.map((c) => ({
        ...c,
        widgets: c.widgets.map((w) =>
          isPageBlockWidget(w) && byBlock[w.content.block] ? { ...w, content: { ...w.content, options: byBlock[w.content.block] } } : w,
        ),
      })),
    })),
  }
}

function propsFor(status: TrackingPreviewStatus, design: HeroDesignV5, style: TrackingStyle = PLAIN_STYLE): TrackingDashboardProps {
  const data = sampleTrackingData({ status, loyalty: 'collecting', extras: ['pickup'] })
  return {
    storeName: 'Lola’s Kitchen',
    logoUrl: null,
    theme: buildTrackingTheme(BRANDING, style),
    options: style.options,
    storefrontLabels: {},
    data,
    shortId: '07',
    currentIndex: getStatusIndex(status),
    placedLabel: '12:24 PM',
    prepPromise: null,
    isAlarmArmed: false,
    onArmAlarm: () => undefined,
    loyalty: <div data-testid="stamp-card">Stamp card here</div>,
    pickup: status === 'cancelled' ? null : <section data-testid="pickup">Pickup code here</section>,
    readyNotice: null,
    onAcknowledgeReady: () => undefined,
    onBack: () => undefined,
    designedPage: { design: preparePageDesign(design, 'tracking'), tenantSlug: 'lolas' },
    paint: { branding: BRANDING, style },
  }
}

function dashboard(props: TrackingDashboardProps): ReactElement {
  const { TrackingDashboard } = load()
  return <TrackingDashboard {...props} />
}

const designsOf = (blockId: string): string[] => {
  const variant = TRACKING_BLOCKS.find((b) => b.id === blockId)!.options.find((o) => o.key === 'variant')
  return variant?.type === 'choice' ? variant.choices.map((c) => c.value) : []
}

/** The style attribute of the block-look wrapper around `el`, if any. */
const wrapperStyle = (el: Element | null) => (el?.closest('[data-block-look]') as HTMLElement | null)?.style

describe('tracking block designs (storefront)', () => {
  it('gives every tracking block a design gallery whose first design is today’s look', () => {
    for (const block of TRACKING_BLOCKS) expect(designsOf(block.id).length).toBeGreaterThanOrEqual(2)
  })

  it.each(TRACKING_BLOCKS.flatMap((block) => designsOf(block.id).map((design) => [block.id, design] as const)))(
    '%s in the “%s” design renders with the status showing',
    (blockId, design) => {
      render(dashboard(propsFor('preparing', withOptions({ [blockId]: { variant: design } }))))
      expect(screen.getByText('Cooking up your order')).toBeInTheDocument()
      expect(screen.getByText('Order #07')).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Order summary' })).toBeInTheDocument()
    },
  )

  it('shows the status in every design on a cancelled order too', () => {
    for (const design of designsOf('tracking.status')) {
      const { unmount } = render(dashboard(propsFor('cancelled', withOptions({ 'tracking.status': { variant: design } }))))
      expect(screen.getByText('Order cancelled')).toBeInTheDocument()
      unmount()
    }
  })

  it('reads an unknown stored design as the first design (the page renders exactly as with none)', () => {
    const blocks = Object.fromEntries(TRACKING_BLOCKS.map((b) => [b.id, { variant: 'carousel', corners: 'blob', color_banner: 'red' }]))
    // Instance ids (useId) differ between two renders; everything else must match.
    const html = (el: Element) => el.innerHTML.replace(/hb-r[\w-]*/g, 'hb-r')
    const { container: bad } = render(dashboard(propsFor('preparing', withOptions(blocks))))
    const badHtml = html(bad)
    const { container: none } = render(dashboard(propsFor('preparing', createStandardDesign('tracking'))))
    expect(badHtml).toBe(html(none))
    expect(bad.querySelector('[data-block-look]')).toBeNull()
  })

  it('follows the Look tab’s banner style with “Same as the Look tab”, and overrides it with an explicit design', () => {
    const solidStore: TrackingStyle = { colors: {}, options: { ...DEFAULT_TRACKING_OPTIONS, hero_style: 'solid' } }
    const { container, unmount } = render(dashboard(propsFor('preparing', withOptions({ 'tracking.status': { variant: 'page' } }), solidStore)))
    const hero = container.querySelector('[data-branding-scope="tracking/hero"]')
    // Follows the page: no block wrapper, the page root's solid banner applies.
    expect(wrapperStyle(hero)).toBeUndefined()
    unmount()

    const { container: soft } = render(dashboard(propsFor('preparing', withOptions({ 'tracking.status': { variant: 'soft' } }), solidStore)))
    const softVars = buildTrackingTheme(BRANDING, withBlockLook(solidStore, { colors: {}, options: { hero_style: 'soft' } })) as Record<string, string>
    expect(wrapperStyle(soft.querySelector('[data-branding-scope="tracking/hero"]'))?.getPropertyValue('--trk-hero-bg')).toBe(softVars['--trk-hero-bg'])
  })

  it('renders the minimal status as a slim card without the decoration', () => {
    const { container } = render(dashboard(propsFor('preparing', withOptions({ 'tracking.status': { variant: 'minimal', show_greeting: false } }))))
    const hero = container.querySelector('[data-branding-scope="tracking/hero"]')!
    expect(hero.className).toContain('p-4')
    expect(hero.querySelectorAll('[aria-hidden="true"].rounded-full.absolute')).toHaveLength(0)
    expect(screen.queryByText('Hi Maria!')).not.toBeInTheDocument()
    expect(screen.getByText('Cooking up your order')).toBeInTheDocument()
  })

  it('changes only that block’s --trk variables when the owner sets a block colour', () => {
    const { container } = render(dashboard(propsFor('preparing', withOptions({ 'tracking.timeline': { color_done: '#123456' } }))))
    const timeline = container.querySelector('[data-branding-scope="tracking/timeline"]')
    expect(wrapperStyle(timeline)?.getPropertyValue('--trk-step-done')).toBe('#123456')
    // The other blocks still paint from the page root.
    expect(wrapperStyle(container.querySelector('[data-branding-scope="tracking/summary"]'))).toBeUndefined()
  })

  it('keeps the pickup code (and its white plate) in the plain design, clearing only the card', () => {
    const { container } = render(dashboard(propsFor('preparing', withOptions({ 'tracking.pickup_qr': { variant: 'plain' } }))))
    const style = wrapperStyle(screen.getByTestId('pickup'))
    expect(style?.getPropertyValue('--trk-pickup-bg')).toBe('transparent')
    expect(container.querySelector('[data-block-look]')?.className).toContain('shadow-none')
  })

  it('lets the loyalty block pick its own stamp tick without touching the page’s', () => {
    render(dashboard(propsFor('preparing', withOptions({ 'tracking.loyalty': { stamp_fill: 'check', stamp_shape: 'square' } }))))
    const style = wrapperStyle(screen.getByTestId('stamp-card'))
    expect(style?.getPropertyValue('--trk-stamp-radius')).toBe('0.375rem')
  })

  it('still renders block designs when the page sent no paint (colours then follow the page)', () => {
    const props = { ...propsFor('preparing', withOptions({ 'tracking.timeline': { variant: 'steps', color_done: '#123456' } })), paint: undefined }
    const { container } = render(dashboard(props))
    expect(container.querySelector('[data-branding-scope="tracking/timeline"] ol.flex')).not.toBeNull()
    expect(container.querySelector('[data-block-look]')).toBeNull()
  })
})

describe('tracking-colors (pure)', () => {
  const option = (values: Options) => (key: string) => values[key]

  it('maps every colour knob onto a real tracking_style colour', () => {
    for (const [knob, key] of Object.entries(TRACKING_COLOR_KNOBS)) {
      expect(knob).toMatch(/^color_[a-z0-9_]{1,34}$/)
      expect(TRACKING_COLOR_KEYS).toContain(key)
    }
  })

  it('keeps only valid hex colours', () => {
    expect(trackingColorOverrides(option({ color_banner: '#ff6600', color_done: 'red', color_total: '' }))).toEqual({ hero_color: '#ff6600' })
  })

  it('reads `page` and unknown values as “follow the page”', () => {
    expect(trackingChoice('hero_style', 'page')).toBeUndefined()
    expect(trackingChoice('hero_style', 'neon')).toBeUndefined()
    expect(trackingChoice('hero_style', 'soft')).toBe('soft')
    expect(blockTrackingLook(option({ corners: 'page' }), { hero_style: undefined })).toEqual({ colors: {}, options: {} })
    expect(blockTrackingLook(option({ corners: 'square' }), { band_style: 'plain' }).options).toEqual({ corners: 'square', band_style: 'plain' })
  })

  it('publishes nothing for an empty look and only the changed variables otherwise', () => {
    expect(blockTrackingVars(BRANDING, PLAIN_STYLE, { colors: {}, options: {} })).toBeNull()
    const vars = blockTrackingVars(BRANDING, PLAIN_STYLE, { colors: { timeline_done: '#123456' }, options: {} }) as Record<string, string>
    expect(vars['--trk-step-done']).toBe('#123456')
    expect(Object.keys(vars).every((name) => name.startsWith('--trk-'))).toBe(true)
    expect(vars['--trk-hero-bg']).toBeUndefined()
  })

  it('derives shades exactly as a store-wide change would', () => {
    const base = buildTrackingTheme(BRANDING, PLAIN_STYLE) as Record<string, string>
    const vars = blockTrackingVars(BRANDING, PLAIN_STYLE, { colors: { hero_color: '#1d4ed8' }, options: {} }) as Record<string, string>
    const storeWide = buildTrackingTheme(BRANDING, readTrackingStyle({ tracking_style: { hero_color: '#1d4ed8' } }))
    // The block's wrapper over the page root = the page a store-wide change would paint.
    expect({ ...base, ...vars }).toEqual(storeWide)
    expect(vars['--trk-hero-bg']).toMatch(/^linear-gradient\(135deg, #1d4ed8, /)
  })

  it('never changes the store’s own look object', () => {
    const style: TrackingStyle = { colors: { accent: '#000000' }, options: DEFAULT_TRACKING_OPTIONS }
    const merged = withBlockLook(style, { colors: { accent: '#ffffff' }, options: { corners: 'square' } })
    expect(style.colors.accent).toBe('#000000')
    expect(style.options.corners).toBe('rounded')
    expect(merged).toEqual({ colors: { accent: '#ffffff' }, options: { ...DEFAULT_TRACKING_OPTIONS, corners: 'square' } })
  })
})
