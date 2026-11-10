/**
 * Order-tracking show toggles (Page Designer v3, "Show toggles added"). Each
 * switch, turned off, hides exactly its part in every design of its block;
 * left at its default the block renders exactly as a block that never had
 * the setting.
 */

import { render } from '@testing-library/react'

import { sampleTrackingBlocks } from '@/components/page-designer/samples/tracking-samples'
import { TRACKING_LIVE_BLOCKS } from '@/components/page-designer/tracking/live-blocks'
import { TrackingBlocksProvider, type TrackingBlocksValue } from '@/components/page-designer/tracking/tracking-blocks-context'
import { sampleTrackingData } from '@/lib/branding-studio/tracking-preview'
import { TRACKING_BLOCKS } from '@/lib/page-designer/blocks-tracking'
import type { BlockOptionValue, PageBlockDef } from '@/lib/page-designer/types'

import { blockProps, both, byText, designsOf, signature, withoutPart, type PartPicker } from '../../utils/part-toggles'

const STORE = 'Lola’s Kitchen'

/** The editor's sample order, preparing, scheduled, with a pickup code and a ready time. */
function scenario(extra: Partial<TrackingBlocksValue> = {}): TrackingBlocksValue {
  const base = sampleTrackingBlocks('preparing', STORE)
  return {
    ...base,
    data: sampleTrackingData({ status: 'preparing', loyalty: 'collecting', extras: ['pickup', 'scheduled'] }),
    ...extra,
  }
}

const PREPARING = scenario()
const ARMED = scenario({ isAlarmArmed: true })
const READY = (() => {
  const base = sampleTrackingBlocks('ready', STORE)
  return { ...base, data: sampleTrackingData({ status: 'ready', loyalty: 'collecting', extras: ['pickup'] }) }
})()

const defOf = (id: string): PageBlockDef => {
  const def = TRACKING_BLOCKS.find((d) => d.id === id)
  if (!def) throw new Error(`no block ${id}`)
  return def
}

function renderBlock(
  def: PageBlockDef,
  variant: string | undefined,
  value: TrackingBlocksValue,
  overrides: Readonly<Record<string, BlockOptionValue>> = {},
  bare = false,
): HTMLElement {
  const Live = TRACKING_LIVE_BLOCKS[def.id]
  const { container, unmount } = render(
    <TrackingBlocksProvider value={value}>
      <Live {...blockProps(def, variant, overrides, bare)} />
    </TrackingBlocksProvider>,
  )
  const copy = container.cloneNode(true) as HTMLElement
  unmount()
  return copy
}

/** A fee row in the tracking summary: the row holding its label. */
const feeRow = (label: string): PartPicker =>
  (root) => Array.from(root.querySelectorAll('div[data-part="muted"]')).filter((el) => el.firstElementChild?.textContent === label)

const inSection = (scope: string, selector: string): PartPicker =>
  (root) => Array.from(root.querySelectorAll(`[data-branding-scope="${scope}"] ${selector}`))

interface ToggleCase {
  block: string
  key: string
  pick: PartPicker
  values?: readonly TrackingBlocksValue[]
}

const CASES: readonly ToggleCase[] = [
  { block: 'tracking.header', key: 'show_store_name', pick: byText('h1[data-part="title"]', STORE) },
  { block: 'tracking.header', key: 'show_order_number', pick: inSection('tracking/header', 'p[data-part="subtitle"]') },
  { block: 'tracking.status', key: 'show_progress', pick: (root) => Array.from(root.querySelectorAll('[data-part="step"]')).slice(0, 1).map((el) => el.parentElement!) },
  { block: 'tracking.status', key: 'show_ready_time', pick: byText('[data-part="card"]', 'Ready by') },
  { block: 'tracking.ring_me', key: 'show_helper', pick: byText('[data-part="muted"]', 'Keep this page open'), values: [ARMED] },
  { block: 'tracking.pickup_qr', key: 'show_title', pick: inSection('tracking/pickup', '[data-part="title"]'), values: [PREPARING, READY] },
  { block: 'tracking.pickup_qr', key: 'show_helper', pick: inSection('tracking/pickup', 'p[data-part="text"]'), values: [PREPARING, READY] },
  { block: 'tracking.summary', key: 'show_title', pick: inSection('tracking/summary', '[data-part="title"]') },
  { block: 'tracking.summary', key: 'show_addons', pick: byText('p[data-part="muted"]', '+ Extra rice') },
  { block: 'tracking.summary', key: 'show_fees', pick: both(feeRow('Delivery fee')) },
]

describe('tracking show toggles', () => {
  it.each(CASES.map((c) => [c.block, c.key, c] as const))('%s %s off hides exactly its part', (_block, _key, c) => {
    const def = defOf(c.block)
    expect(def.options.find((o) => o.key === c.key)).toMatchObject({ type: 'boolean', default: true })
    for (const variant of designsOf(def)) {
      for (const value of c.values ?? [PREPARING]) {
        const on = renderBlock(def, variant, value)
        const off = renderBlock(def, variant, value, { [c.key]: false })
        const { stripped, removed } = withoutPart(on, c.pick)
        expect(removed).toBeGreaterThan(0)
        expect(c.pick(off)).toHaveLength(0)
        expect(signature(off)).toBe(signature(stripped))
      }
    }
  })

  it('every new switch is a labelled boolean in Settings that starts on', () => {
    const keys: Record<string, readonly string[]> = {
      'tracking.header': ['show_store_name', 'show_order_number'],
      'tracking.status': ['show_progress', 'show_ready_time'],
      'tracking.ring_me': ['show_helper'],
      'tracking.pickup_qr': ['show_title', 'show_helper'],
      'tracking.summary': ['show_title', 'show_addons', 'show_fees'],
    }
    for (const [block, list] of Object.entries(keys)) {
      for (const key of list) {
        const option = defOf(block).options.find((o) => o.key === key)
        expect(option).toMatchObject({ type: 'boolean', default: true })
        expect(option?.group ?? 'options').toBe('options')
        expect(option?.label.length).toBeGreaterThan(0)
      }
    }
  })

  it('the pickup code and its number stay with both pickup switches off', () => {
    const def = defOf('tracking.pickup_qr')
    const off = renderBlock(def, undefined, PREPARING, { show_title: false, show_helper: false })
    expect(off.querySelector('svg')).not.toBeNull()
    expect(off.textContent).toContain('#07')
  })

  describe('defaults render exactly as a block without the settings', () => {
    const values: readonly TrackingBlocksValue[] = [PREPARING, ARMED, READY]
    it.each(TRACKING_BLOCKS.map((def) => [def.id, def] as const))('%s', (_id, def) => {
      for (const variant of designsOf(def)) {
        for (const value of values) {
          expect(renderBlock(def, variant, value).innerHTML).toBe(renderBlock(def, variant, value, {}, true).innerHTML)
        }
      }
    })
  })
})
