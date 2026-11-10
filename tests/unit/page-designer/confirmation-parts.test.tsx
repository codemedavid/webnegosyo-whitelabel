/**
 * Thank-you page part marks (Page Designer part styles, parts.ts). Every
 * block, in every design, marks the parts its registry entry lists (so the
 * Style tab never offers a part the block doesn't draw), and nothing carries
 * a `data-part` value parts.ts doesn't define.
 */

import { render } from '@testing-library/react'

import type { PageBlockRenderProps } from '@/components/hero-builder/renderer/page-runtime'
import { ConfirmationBlocksProvider, type ConfirmationBlocksValue } from '@/components/page-designer/confirmation/confirmation-context'
import { CONFIRMATION_LIVE_BLOCKS } from '@/components/page-designer/confirmation/live-blocks'
import { sampleConfirmationValue } from '@/components/page-designer/confirmation/sample-order'
import { CONFIRMATION_BLOCKS } from '@/lib/page-designer/blocks-confirmation'
import { PARTS, SHARED_PARTS } from '@/lib/page-designer/parts'
import type { PageBlockDef } from '@/lib/page-designer/types'

import { missingParts, unknownMarks } from '../../utils/part-marks'

const inert = (): void => undefined

/** The sample order with every optional line showing: a schedule, a fee, a discount, both countdowns. */
function scenario(isFailed: boolean, extra: Partial<ConfirmationBlocksValue> = {}): ConfirmationBlocksValue {
  const base = sampleConfirmationValue('Lola’s Kitchen', isFailed)
  return {
    ...base,
    order: {
      ...base.order,
      scheduledForLabel: 'Today, 6:30 PM',
      deliveryFee: 50,
      serviceChargeAmount: 20,
      discounts: [{ code: 'SAVE10', label: 'SAVE10', amount: 20 }] as ConfirmationBlocksValue['order']['discounts'],
    },
    isMessageExpanded: true,
    trackingCountdown: 3,
    onStayHere: inert,
    ...extra,
  }
}

/** Every state a thank-you block can be in: sent, not confirmed, kiosk, no Messenger page connected. */
const SCENARIOS: readonly ConfirmationBlocksValue[] = [
  scenario(false),
  scenario(true),
  scenario(false, { isKiosk: true, kioskCountdown: 4 }),
  (() => {
    const s = scenario(false)
    return { ...s, order: { ...s.order, messengerUrl: '' } }
  })(),
]

function designsOf(def: PageBlockDef): readonly (string | undefined)[] {
  const variant = def.options.find((o) => o.key === 'variant')
  return variant?.type === 'choice' ? variant.choices.map((c) => c.value) : [undefined]
}

function propsFor(def: PageBlockDef, variant: string | undefined): PageBlockRenderProps {
  return {
    def,
    text: (slot) => def.texts.find((t) => t.key === slot)?.fallback ?? '',
    option: (key) => (key === 'variant' && variant ? variant : def.options.find((o) => o.key === key)?.default),
    isEditor: false,
  }
}

/** One render per scenario, each detached so they can be compared after unmount. */
function renderAll(def: PageBlockDef, variant: string | undefined): HTMLElement[] {
  const Live = CONFIRMATION_LIVE_BLOCKS[def.id]!
  return SCENARIOS.map((value) => {
    const { container, unmount } = render(
      <ConfirmationBlocksProvider value={value}>
        <Live {...propsFor(def, variant)} />
      </ConfirmationBlocksProvider>,
    )
    const copy = container.cloneNode(true) as HTMLElement
    unmount()
    return copy
  })
}

const CASES = CONFIRMATION_BLOCKS.flatMap((def) => designsOf(def).map((variant) => [def.id, variant ?? 'only design', def, variant] as const))

describe('thank-you part marks', () => {
  it('lists only real, non-shared parts in every block', () => {
    const ids = new Set<string>(PARTS.map((p) => p.id))
    for (const def of CONFIRMATION_BLOCKS) {
      expect(def.parts).toBeDefined()
      for (const id of def.parts ?? []) {
        expect(ids.has(id)).toBe(true)
        expect(SHARED_PARTS as readonly string[]).not.toContain(id)
      }
    }
  })

  it.each(CASES)('%s (%s) marks every part it lists, and only known parts', (_id, _design, def, variant) => {
    const roots = renderAll(def, variant)
    expect(missingParts(def.parts ?? [], roots)).toEqual([])
    for (const root of roots) expect(unknownMarks(root)).toEqual([])
    // Every block draws at least its wording as a part.
    expect(roots.some((root) => root.querySelector('[data-part]'))).toBe(true)
  })

  it('marks the card and title of every card-shaped block', () => {
    for (const id of ['confirmation.summary', 'confirmation.customer', 'confirmation.payment', 'confirmation.messenger']) {
      const def = CONFIRMATION_BLOCKS.find((d) => d.id === id)!
      for (const variant of designsOf(def)) {
        const [sent] = renderAll(def, variant)
        expect(sent.querySelector('[data-part="card"]')).not.toBeNull()
        expect(sent.querySelector('[data-part="title"]')).not.toBeNull()
      }
    }
  })

  it('marks Track as the main button and Back as a second button in every layout', () => {
    const def = CONFIRMATION_BLOCKS.find((d) => d.id === 'confirmation.actions')!
    for (const variant of designsOf(def)) {
      const [sent] = renderAll(def, variant)
      expect(sent.querySelector('[data-part="button"]')).toHaveTextContent('Track Your Order')
      expect(sent.querySelector('[data-part="button-alt"]')).toHaveTextContent('Back to Menu')
    }
  })
})
