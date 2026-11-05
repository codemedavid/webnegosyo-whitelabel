/**
 * The block inspector: a design gallery of live thumbnails, colours that
 * follow the page until set, settings that only show for the designs they
 * apply to, and one tap back to the standard look.
 */

import { fireEvent, render, screen } from '@testing-library/react'

import { PageBlockFields } from '@/components/hero-builder/editor/inspector/page-block-fields'
import type { HeroBuilderApi } from '@/components/hero-builder/editor/use-hero-builder'
import { PageRuntimeProvider, type PageRuntime } from '@/components/hero-builder/renderer/page-runtime'
import { CHECKOUT_SAMPLE_BLOCKS } from '@/components/page-designer/samples/checkout-samples'
import { createPageBlock } from '@/lib/page-designer/design-blocks'
import { pageBlockDef } from '@/lib/page-designer/blocks'
import type { PageBlockContent, Widget } from '@/lib/hero-builder/types'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }))

const runtime: PageRuntime = { page: 'checkout', state: null, tokens: { store: 'Island Silog' }, labels: {}, blocks: CHECKOUT_SAMPLE_BLOCKS }

function orderTypeWidget(options: Record<string, unknown> = {}): Widget {
  const def = pageBlockDef('checkout', 'checkout.order_type')
  if (!def) throw new Error('order type block missing')
  const widget = createPageBlock(def)
  return { ...widget, content: { ...(widget.content as PageBlockContent), options } } as Widget
}

function renderInspector(widget: Widget) {
  const editContent = jest.fn()
  const api = { editContent } as unknown as HeroBuilderApi
  render(
    <PageRuntimeProvider value={runtime}>
      <PageBlockFields widget={widget} api={api} />
    </PageRuntimeProvider>,
  )
  return { editContent }
}

const lastOptions = (editContent: jest.Mock) => (editContent.mock.calls.at(-1)?.[1] as Partial<PageBlockContent>).options

describe('page block inspector', () => {
  it('shows one design tile per design with the current one picked, and picks another', () => {
    const { editContent } = renderInspector(orderTypeWidget())
    const gallery = screen.getByRole('radiogroup', { name: 'Design' })
    const designs = gallery.querySelectorAll('[role="radio"]')
    expect(designs).toHaveLength(7)
    expect(screen.getByRole('radio', { name: /Tiles/ })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: /Big buttons/ }))
    expect(lastOptions(editContent)).toEqual({ variant: 'buttons' })
  })

  it('shows a setting only for the designs it applies to', () => {
    renderInspector(orderTypeWidget({ variant: 'buttons' }))
    expect(screen.getByRole('radio', { name: 'Centre' })).toBeInTheDocument()
    expect(screen.queryByText('Across')).toBeNull()
    expect(screen.queryByText('Pickup photo')).toBeNull()
  })

  it('offers the photos for the photo design', () => {
    renderInspector(orderTypeWidget({ variant: 'photo' }))
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
    const { editContent } = renderInspector(orderTypeWidget({ variant: 'list', corners: 'round' }))
    fireEvent.click(screen.getByRole('button', { name: /Use the standard look/ }))
    expect(lastOptions(editContent)).toEqual({})
  })

  it('offers no reset while the block has its standard look', () => {
    renderInspector(orderTypeWidget())
    expect(screen.queryByRole('button', { name: /Use the standard look/ })).toBeNull()
  })
})
