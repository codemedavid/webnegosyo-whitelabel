/**
 * The block inspector: the Style tab has a design gallery of live
 * thumbnails, colours that follow the page until set, every part's style,
 * quick styles, copy / paste / use-on-every-block, and one tap back to the
 * standard look; the Content tab keeps the words and settings that apply
 * to the chosen design.
 */

import { fireEvent, render, screen } from '@testing-library/react'

import { bindNodeStyle } from '@/components/hero-builder/editor/inspector/node-style'
import { PageBlockFields } from '@/components/hero-builder/editor/inspector/page-block-fields'
import { mapPageBlocks, PageBlockStyle } from '@/components/hero-builder/editor/inspector/page-block-style'
import type { HeroBuilderApi } from '@/components/hero-builder/editor/use-hero-builder'
import { PageRuntimeProvider, type PageRuntime } from '@/components/hero-builder/renderer/page-runtime'
import { CHECKOUT_SAMPLE_BLOCKS } from '@/components/page-designer/samples/checkout-samples'
import { ORDER_TYPE_DESIGNS } from '@/components/customer/checkout-templates/order-type-choices'
import { createPageBlock } from '@/lib/page-designer/design-blocks'
import { pageBlockDef } from '@/lib/page-designer/blocks'
import type { HeroDesignV5, PageBlockContent, Widget } from '@/lib/hero-builder/types'
import { createStandardDesign } from '@/lib/page-designer/standard-designs'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }))

const runtime: PageRuntime = { page: 'checkout', state: null, tokens: { store: 'Island Silog' }, labels: {}, blocks: CHECKOUT_SAMPLE_BLOCKS }

function orderTypeWidget(options: Record<string, unknown> = {}): Widget {
  const def = pageBlockDef('checkout', 'checkout.order_type')
  if (!def) throw new Error('order type block missing')
  const widget = createPageBlock(def)
  return { ...widget, content: { ...(widget.content as PageBlockContent), options } } as Widget
}

function renderInspector(widget: Widget, tab: 'content' | 'style' = 'style', design: HeroDesignV5 = createStandardDesign('checkout')) {
  const editContent = jest.fn()
  const editDesign = jest.fn()
  const api = { editContent, editDesign, editStyle: jest.fn(), device: 'desktop', design } as unknown as HeroBuilderApi
  render(
    <PageRuntimeProvider value={runtime}>
      {tab === 'content' ? <PageBlockFields widget={widget} api={api} /> : <PageBlockStyle widget={widget} api={api} b={bindNodeStyle(api, widget)} />}
    </PageRuntimeProvider>,
  )
  return { editContent, editDesign }
}

const lastOptions = (editContent: jest.Mock) => (editContent.mock.calls.at(-1)?.[1] as Partial<PageBlockContent>).options

describe('page block inspector', () => {
  it('shows one design tile per design with the current one picked, and picks another', () => {
    const { editContent } = renderInspector(orderTypeWidget())
    const gallery = screen.getByRole('radiogroup', { name: 'Design' })
    // Only the tiles themselves: a thumbnail of a radio-group design holds radios of its own.
    const designs = [...gallery.children].filter((el) => el.getAttribute('role') === 'radio')
    expect(designs).toHaveLength(ORDER_TYPE_DESIGNS.length)
    expect(screen.getByRole('radio', { name: /Tiles/ })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: /Big buttons/ }))
    expect(lastOptions(editContent)).toEqual({ variant: 'buttons' })
  })

  it('shows a setting only for the designs it applies to', () => {
    renderInspector(orderTypeWidget({ variant: 'buttons' }), 'content')
    expect(screen.getByRole('radio', { name: 'Centre' })).toBeInTheDocument()
    expect(screen.queryByText('Across')).toBeNull()
    expect(screen.queryByText('Pickup photo')).toBeNull()
  })

  it('offers the photos for the photo design', () => {
    renderInspector(orderTypeWidget({ variant: 'photo' }), 'content')
    expect(screen.getByText('Pickup photo')).toBeInTheDocument()
    expect(screen.getByText('Across')).toBeInTheDocument()
  })

  it('shows colours as following the page until set, and clears a set colour back to it', () => {
    const { editContent } = renderInspector(orderTypeWidget({ color_accent: '#0f766e' }))
    expect(screen.getAllByText(/Page colour ·/).length).toBeGreaterThan(0)
    expect(screen.getByText('Only on this block')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Chosen option: use the page colour/ }))
    expect(lastOptions(editContent)).toEqual({})
  })

  it('puts the block back to its standard look in one tap', () => {
    const { editContent } = renderInspector(orderTypeWidget({ variant: 'list', corners: 'round', color_accent: '#000000', p_option_on_bg: '#111111' }))
    fireEvent.click(screen.getByRole('button', { name: /Standard look/ }))
    // The design, colours and part styles go; settings (corners) stay on the Content tab.
    expect(lastOptions(editContent)).toEqual({ corners: 'round' })
  })

  it('offers no reset while the block has its standard look', () => {
    renderInspector(orderTypeWidget())
    expect(screen.queryByRole('button', { name: /Standard look/ })).toBeNull()
  })

  it('keeps designs and colours off the Content tab', () => {
    renderInspector(orderTypeWidget(), 'content')
    expect(screen.queryByRole('radiogroup', { name: 'Design' })).toBeNull()
    expect(screen.queryByText('Block colours')).toBeNull()
    expect(screen.getByText(/on the Style tab/)).toBeInTheDocument()
  })

  it('styles a part: the chosen option fill', () => {
    const { editContent } = renderInspector(orderTypeWidget())
    fireEvent.click(screen.getByRole('button', { name: /^Chosen$/ }))
    fireEvent.change(screen.getByLabelText('Fill', { selector: 'input[type="color"]' }), { target: { value: '#123456' } })
    expect(lastOptions(editContent)).toEqual({ p_option_on_bg: '#123456' })
  })

  it('offers only the parts the block draws', () => {
    renderInspector(orderTypeWidget())
    expect(screen.getByRole('button', { name: /^Card/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Steps not reached/ })).toBeNull()
  })

  it('a quick style keeps the design and colours', () => {
    const { editContent } = renderInspector(orderTypeWidget({ variant: 'list', color_text: '#222222' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }))
    expect(lastOptions(editContent)).toEqual(expect.objectContaining({ variant: 'list', color_text: '#222222', p_card_shadow: 'hard' }))
  })

  it('uses a block style on every block, each keeping only the parts it draws', () => {
    const { editDesign } = renderInspector(orderTypeWidget({ p_card_radius: 'none', p_option_on_bg: '#111111' }))
    fireEvent.click(screen.getByRole('button', { name: /Use on every block/ }))
    const update = editDesign.mock.calls[0][0] as (d: HeroDesignV5) => HeroDesignV5
    const next = update(createStandardDesign('checkout'))
    const blocks = next.sections.flatMap((s) => s.columns.flatMap((c) => c.widgets)).map((w) => w.content as PageBlockContent)
    const placeOrder = blocks.find((b) => b.block === 'checkout.place_order')!
    expect(placeOrder.options.p_card_radius).toBe('none')
    expect(blocks.find((b) => b.block === 'checkout.order_type')!.options.p_option_on_bg).toBe('#111111')
  })

  it('mapPageBlocks leaves free widgets alone', () => {
    const design = createStandardDesign('checkout')
    const next = mapPageBlocks(design, 'checkout', (o) => ({ ...o, p_card_bg: '#ffffff' }))
    expect(next.sections[0].columns[0].widgets.every((w) => (w.content as PageBlockContent).options.p_card_bg === '#ffffff')).toBe(true)
  })
})
