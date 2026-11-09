/**
 * Order-tracking part marks (Page Designer part styles, parts.ts). Every
 * block, in every design, marks the parts its registry entry lists, the
 * timeline and status bar mark the current and done steps, and nothing
 * carries a `data-part` value parts.ts doesn't define. The pickup code's
 * white plate stays unmarked so no part style can repaint it.
 */

import { fireEvent, render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import { LoyaltyStampCard } from '@/components/customer/loyalty-stamp-card'
import type { PageBlockRenderProps } from '@/components/hero-builder/renderer/page-runtime'
import { sampleTrackingBlocks } from '@/components/page-designer/samples/tracking-samples'
import { TRACKING_LIVE_BLOCKS } from '@/components/page-designer/tracking/live-blocks'
import { TrackingBlocksProvider, type TrackingBlocksValue } from '@/components/page-designer/tracking/tracking-blocks-context'
import { sampleOffer, sampleStampCard, sampleTrackingData } from '@/lib/branding-studio/tracking-preview'
import { TRACKING_BLOCKS } from '@/lib/page-designer/blocks-tracking'
import { PARTS, SHARED_PARTS } from '@/lib/page-designer/parts'
import type { PageBlockDef } from '@/lib/page-designer/types'

import { missingParts, unknownMarks } from '../../utils/part-marks'

const STORE = 'Lola’s Kitchen'
const ID = 'sample-order'

/** Parts only some designs draw: block → part → the designs that draw it. */
const ONLY_IN: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  'tracking.back': { button: ['solid'], button_alt: ['quiet', 'outline'] },
  // Only the standard card has the quantity chips.
  'tracking.summary': { badge: ['standard'] },
}

const OFFER = sampleOffer(null, 'collecting')

/** A loyalty card face: the claim form (number box, labels, button), awaiting (icon) or the earned card with its rewards link. */
function loyaltyCard(view: 'claim' | 'awaiting' | 'card', isSample = true): ReactNode {
  return (
    <LoyaltyStampCard
      orderId={ID}
      tenantId={ID}
      trackingToken={ID}
      hasName={false}
      offer={OFFER}
      isOrderComplete={false}
      storeName={STORE}
      tenantSlug="lolas"
      view={view}
      card={view === 'card' ? sampleStampCard(OFFER, 'collecting') : null}
      isSample={isSample}
    />
  )
}

/** The editor's sample order, preparing, scheduled, with a pickup code. */
function scenario(extra: Partial<TrackingBlocksValue> = {}): TrackingBlocksValue {
  const base = sampleTrackingBlocks('preparing', STORE)
  return {
    ...base,
    data: sampleTrackingData({ status: 'preparing', loyalty: 'collecting', extras: ['pickup', 'scheduled'] }),
    ...extra,
  }
}

const SCENARIOS: readonly TrackingBlocksValue[] = [
  scenario(),
  scenario({ loyalty: loyaltyCard('claim') }),
  scenario({ loyalty: loyaltyCard('awaiting') }),
  scenario({ loyalty: loyaltyCard('card') }),
]

function designsOf(def: PageBlockDef): readonly string[] {
  const variant = def.options.find((o) => o.key === 'variant')
  return variant?.type === 'choice' ? variant.choices.map((c) => c.value) : []
}

function propsFor(def: PageBlockDef, variant: string): PageBlockRenderProps {
  return {
    def,
    text: (slot) => def.texts.find((t) => t.key === slot)?.fallback ?? '',
    option: (key) => (key === 'variant' ? variant : def.options.find((o) => o.key === key)?.default),
    isEditor: false,
  }
}

function renderBlock(def: PageBlockDef, variant: string, value: TrackingBlocksValue) {
  const Live = TRACKING_LIVE_BLOCKS[def.id]
  return render(
    <TrackingBlocksProvider value={value}>
      <Live {...propsFor(def, variant)} />
    </TrackingBlocksProvider>,
  )
}

/** One render per scenario, each detached so they can be compared after unmount. */
function renderAll(def: PageBlockDef, variant: string): HTMLElement[] {
  return SCENARIOS.map((value) => {
    const { container, unmount } = renderBlock(def, variant, value)
    const copy = container.cloneNode(true) as HTMLElement
    unmount()
    return copy
  })
}

/** The parts `def` should draw in `variant` (a part only some designs draw is expected only there). */
function expectedParts(def: PageBlockDef, variant: string): string[] {
  const only = ONLY_IN[def.id] ?? {}
  // The mistake message needs a failed save: checked on its own below.
  return (def.parts ?? []).filter((id) => id !== 'error' && (!only[id] || only[id].includes(variant)))
}

const CASES = TRACKING_BLOCKS.flatMap((def) => designsOf(def).map((variant) => [def.id, variant, def] as const))

describe('tracking part marks', () => {
  it('lists only real, non-shared parts, with both step states wherever steps are', () => {
    const ids = new Set<string>(PARTS.map((p) => p.id))
    for (const def of TRACKING_BLOCKS) {
      expect(def.parts).toBeDefined()
      const parts = def.parts ?? []
      for (const id of parts) {
        expect(ids.has(id)).toBe(true)
        expect(SHARED_PARTS as readonly string[]).not.toContain(id)
      }
      if (parts.includes('step')) expect(parts).toEqual(expect.arrayContaining(['step_on', 'step_done']))
    }
  })

  it('marks each part only in the designs ONLY_IN names, and those parts are listed', () => {
    for (const [id, parts] of Object.entries(ONLY_IN)) {
      const def = TRACKING_BLOCKS.find((d) => d.id === id)!
      for (const part of Object.keys(parts)) expect(def.parts).toContain(part)
    }
  })

  it.each(CASES)('%s (%s) marks every part it lists, and only known parts', (_id, variant, def) => {
    const roots = renderAll(def, variant)
    expect(missingParts(expectedParts(def, variant), roots)).toEqual([])
    for (const root of roots) expect(unknownMarks(root)).toEqual([])
    expect(roots.some((root) => root.querySelector('[data-part]'))).toBe(true)
  })

  it.each(['tracking.status', 'tracking.timeline'])('%s marks one current step and the done ones before it', (id) => {
    const def = TRACKING_BLOCKS.find((d) => d.id === id)!
    const value = scenario()
    for (const variant of designsOf(def)) {
      const { container, unmount } = renderBlock(def, variant, value)
      const steps = Array.from(container.querySelectorAll('[data-part="step"]'))
      expect(steps.length).toBeGreaterThan(value.currentIndex)
      expect(steps.filter((s) => s.hasAttribute('data-on'))).toEqual([steps[value.currentIndex]])
      expect(steps.filter((s) => s.hasAttribute('data-done'))).toEqual(steps.slice(0, value.currentIndex))
      unmount()
    }
  })

  it('keeps the pickup code’s white plate unmarked', () => {
    const def = TRACKING_BLOCKS.find((d) => d.id === 'tracking.pickup_qr')!
    for (const variant of designsOf(def)) {
      const { container, unmount } = renderBlock(def, variant, scenario())
      const plate = container.querySelector('.bg-white')
      expect(plate?.querySelector('svg')).not.toBeNull()
      expect(plate?.closest('[data-part]')?.getAttribute('data-part')).toBe('card')
      expect(plate?.hasAttribute('data-part')).toBe(false)
      unmount()
    }
  })

  describe('a failed loyalty save', () => {
    const realFetch = global.fetch
    afterEach(() => {
      global.fetch = realFetch
    })

    it('marks the mistake message', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch
      const def = TRACKING_BLOCKS.find((d) => d.id === 'tracking.loyalty')!
      const { container } = renderBlock(def, designsOf(def)[0], scenario({ loyalty: loyaltyCard('claim', false) }))
      fireEvent.change(container.querySelector('input[type="tel"]')!, { target: { value: '0917 123 4567' } })
      fireEvent.submit(container.querySelector('form')!)
      await waitFor(() => expect(container.querySelector('[data-part="error"]')).toHaveTextContent(/couldn.t save/))
      expect(unknownMarks(container)).toEqual([])
    })
  })
})
