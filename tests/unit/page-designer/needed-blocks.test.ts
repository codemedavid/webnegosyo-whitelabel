/**
 * Removable blocks the order can't go without: the owner may take them out,
 * and the page adds a plain copy back while the store needs it.
 */

import { blockIdsIn } from '@/lib/page-designer/design-blocks'
import { pageBlockDef, requiredBlocks } from '@/lib/page-designer/blocks'
import { pageDesignProblem, preparePageDesign } from '@/lib/page-designer/rules'
import { createStandardDesign } from '@/lib/page-designer/standard-designs'
import type { HeroDesignV5, PageBlockContent } from '@/lib/hero-builder/types'
import { checkoutNeeds } from '@/components/page-designer/checkout/designed-checkout'

function without(design: HeroDesignV5, ids: readonly string[]): HeroDesignV5 {
  return {
    ...design,
    sections: design.sections.map((s) => ({
      ...s,
      columns: s.columns.map((c) => ({ ...c, widgets: c.widgets.filter((w) => !(w.content.kind === 'page-block' && ids.includes(w.content.block))) })),
    })),
  }
}

const REMOVABLE = ['checkout.order_type', 'checkout.schedule', 'checkout.customer', 'checkout.summary', 'checkout.voucher', 'checkout.gov_discount', 'checkout.payment']

describe('needed-when blocks', () => {
  it('only Place order (checkout), the status (thank-you, tracking) are always required', () => {
    expect(requiredBlocks('checkout').map((d) => d.id)).toEqual(['checkout.place_order'])
    expect(requiredBlocks('confirmation').map((d) => d.id)).toEqual(['confirmation.status'])
    expect(requiredBlocks('tracking').map((d) => d.id)).toEqual(['tracking.status'])
  })

  it('a checkout without the removable blocks publishes', () => {
    expect(pageDesignProblem(without(createStandardDesign('checkout'), REMOVABLE), 'checkout')).toBeNull()
  })

  it('adds back exactly the blocks the store needs, once', () => {
    const lean = without(createStandardDesign('checkout'), REMOVABLE)
    expect(blockIdsIn(preparePageDesign(lean, 'checkout'))).not.toContain('checkout.payment')
    const needed = preparePageDesign(lean, 'checkout', { payment: true, questions: true, order_choice: true })
    const ids = blockIdsIn(needed)
    expect(ids).toEqual(expect.arrayContaining(['checkout.payment', 'checkout.customer', 'checkout.order_type']))
    expect(ids).not.toContain('checkout.schedule')
    expect(ids).not.toContain('checkout.voucher')
    // Preparing again (the server already prepared it) rebuilds, never doubles.
    const again = preparePageDesign(needed, 'checkout', { payment: true, questions: true, order_choice: true })
    expect(blockIdsIn(again).filter((id) => id === 'checkout.payment')).toHaveLength(1)
    expect(again.sections.filter((s) => s.id === 'page-fallback')).toHaveLength(1)
  })

  it('a hidden needed block comes back on the devices that hide it', () => {
    const design = createStandardDesign('checkout')
    const hidden: HeroDesignV5 = {
      ...design,
      sections: design.sections.map((s) => ({
        ...s,
        columns: s.columns.map((c) => ({
          ...c,
          widgets: c.widgets.map((w) => (w.content.kind === 'page-block' && w.content.block === 'checkout.payment' ? { ...w, mobile: { hidden: true } } : w)),
        })),
      })),
    }
    const prepared = preparePageDesign(hidden, 'checkout', { payment: true })
    const fallback = prepared.sections.find((s) => s.id === 'page-fallback')!
    const payment = fallback.columns[0].widgets.find((w) => (w.content as PageBlockContent).block === 'checkout.payment')!
    expect(payment.mobile?.hidden).toBe(false)
    expect(payment.style.hidden).toBe(true)
  })

  it('without a summary, the place-order button shows the total', () => {
    const prepared = preparePageDesign(without(createStandardDesign('checkout'), ['checkout.summary']), 'checkout')
    const place = prepared.sections.flatMap((s) => s.columns.flatMap((c) => c.widgets)).find((w) => (w.content as PageBlockContent).block === 'checkout.place_order')!
    expect((place.content as PageBlockContent).options.show_total).toBe(true)
  })

  it('a kiosk thank-you page gets its actions back', () => {
    const lean = without(createStandardDesign('confirmation'), ['confirmation.actions'])
    expect(pageDesignProblem(lean, 'confirmation')).toBeNull()
    expect(blockIdsIn(preparePageDesign(lean, 'confirmation'))).not.toContain('confirmation.actions')
    expect(blockIdsIn(preparePageDesign(lean, 'confirmation', { kiosk: true }))).toContain('confirmation.actions')
  })

  it('every needed-when block says why', () => {
    for (const id of REMOVABLE) expect(pageBlockDef('checkout', id)?.required).toBe(false)
  })

  it('reads the needs from the live checkout', () => {
    const needs = checkoutNeeds({
      shouldAskFulfillment: true,
      advanceConfig: { enabled: false },
      formFields: [{ is_required: true }],
      paymentMethods: [{}],
      tenant: { qr_handoff_enabled: false },
      govSetup: null,
    } as unknown as Parameters<typeof checkoutNeeds>[0])
    expect(needs).toEqual({ order_choice: true, scheduling: false, questions: true, payment: true, gov_claims: false })
  })
})

describe('stepped layouts', () => {
  it('refuses a step hidden on one device (it would be an empty step there)', () => {
    const base = createStandardDesign('checkout')
    const design: HeroDesignV5 = { ...base, page: { layout: 'steps' }, sections: base.sections.map((s) => ({ ...s, mobile: { hidden: true } })) }
    expect(pageDesignProblem(design, 'checkout')).toMatch(/hidden on phones/)
    expect(pageDesignProblem({ ...design, page: undefined }, 'checkout')).not.toMatch(/empty step/)
  })
})

it('puts the blocks it adds back before the section holding Place order', () => {
  const base = createStandardDesign('checkout')
  const lean = without(base, ['checkout.payment'])
  const prepared = preparePageDesign(lean, 'checkout', { payment: true })
  expect(prepared.sections.map((s) => s.id)).toEqual(['page-fallback', ...lean.sections.map((s) => s.id)])
})
