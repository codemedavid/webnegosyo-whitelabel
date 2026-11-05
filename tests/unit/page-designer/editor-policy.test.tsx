import { act, renderHook } from '@testing-library/react'

import { blockDef } from '@/lib/page-designer/blocks'
import { blockIdsIn } from '@/lib/page-designer/design-blocks'
import { createStandardDesign } from '@/lib/page-designer/standard-designs'
import { PAGE_NODE_POLICY } from '@/components/hero-builder/editor/page-policy'
import { useHeroBuilder } from '@/components/hero-builder/editor/use-hero-builder'

const widgetId = (design: ReturnType<typeof createStandardDesign>, block: string) =>
  design.sections[0].columns[0].widgets.find((w) => w.content.kind === 'page-block' && w.content.block === block)!.id

describe('Page Designer editor locks', () => {
  it('refuses to delete or duplicate a required block, and the section holding it', () => {
    const start = createStandardDesign('checkout')
    const { result } = renderHook(() => useHeroBuilder(start, PAGE_NODE_POLICY))
    const placeOrder = widgetId(start, 'checkout.place_order')
    expect(result.current.canRemove(placeOrder)).toBe(false)
    act(() => result.current.remove(placeOrder))
    act(() => result.current.remove(start.sections[0].id))
    act(() => result.current.duplicate(placeOrder))
    expect(blockIdsIn(result.current.design)).toEqual(blockIdsIn(start))
  })

  it('removes an optional block, which can then be added back once', () => {
    const start = createStandardDesign('checkout')
    const { result } = renderHook(() => useHeroBuilder(start, PAGE_NODE_POLICY))
    act(() => result.current.remove(widgetId(start, 'checkout.sms_opt_in')))
    expect(blockIdsIn(result.current.design)).not.toContain('checkout.sms_opt_in')
  })

  it('locks the voucher field, so a design can never stop customers entering a code', () => {
    const start = createStandardDesign('checkout')
    const { result } = renderHook(() => useHeroBuilder(start, PAGE_NODE_POLICY))
    const voucher = widgetId(start, 'checkout.voucher')
    expect(result.current.canRemove(voucher)).toBe(false)
    act(() => result.current.remove(voucher))
    expect(blockIdsIn(result.current.design)).toContain('checkout.voucher')
  })

  it('lets the owner remove the thank-you Messenger block (most stores no longer use Messenger)', () => {
    const start = createStandardDesign('confirmation')
    const { result } = renderHook(() => useHeroBuilder(start, PAGE_NODE_POLICY))
    const messenger = widgetId(start, 'confirmation.messenger')
    expect(result.current.canRemove(messenger)).toBe(true)
    act(() => result.current.remove(messenger))
    expect(blockIdsIn(result.current.design)).not.toContain('confirmation.messenger')
  })

  it('keeps the plain Hero Builder unlocked', () => {
    const start = createStandardDesign('tracking')
    const { result } = renderHook(() => useHeroBuilder(start))
    act(() => result.current.remove(start.sections[0].id))
    expect(result.current.design.sections).toHaveLength(0)
  })

  it('records "Show when" and clears it', () => {
    const start = createStandardDesign('tracking')
    const { result } = renderHook(() => useHeroBuilder(start, PAGE_NODE_POLICY))
    const id = widgetId(start, 'tracking.summary')
    act(() => result.current.editShowWhen(id, ['ready', 'delivered']))
    expect(result.current.design.sections[0].columns[0].widgets.find((w) => w.id === id)?.showWhen).toEqual(['ready', 'delivered'])
    act(() => result.current.editShowWhen(id, []))
    expect(result.current.design.sections[0].columns[0].widgets.find((w) => w.id === id)).not.toHaveProperty('showWhen')
    expect(blockDef('tracking.summary')?.required).toBe(false)
  })
})
