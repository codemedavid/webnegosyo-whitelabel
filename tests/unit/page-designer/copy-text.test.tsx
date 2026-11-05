import { act, fireEvent, render, screen } from '@testing-library/react'

import { createWidget } from '@/lib/hero-builder/defaults'
import { loadHeroDesign } from '@/lib/hero-builder/load'
import { heroDesignV5Schema } from '@/lib/hero-builder/schema'
import type { CopyTextContent, Section, Widget } from '@/lib/hero-builder/types'
import { PAGE_IDS, PAGE_META } from '@/lib/page-designer/pages'
import { blockDef } from '@/lib/page-designer/blocks'
import { createPageBlock } from '@/lib/page-designer/design-blocks'
import { pageDesignProblem } from '@/lib/page-designer/rules'
import { storeAddressToken } from '@/lib/page-designer/store-address'
import { HERO_ADD_GROUPS } from '@/components/hero-builder/editor/panels/add-panel'
import { HeroBuilderRenderer } from '@/components/hero-builder/renderer/hero-builder-renderer'
import { isShownForOrder, PageRuntimeProvider, type PageRuntime } from '@/components/hero-builder/renderer/page-runtime'

import { column, designOf, section } from '../hero-builder/helpers'

const copyWidget = (patch: Partial<CopyTextContent> = {}, extra: Partial<Widget> = {}): Widget => {
  const base = createWidget('copy-text')
  return { ...base, id: 'copy', content: { ...(base.content as CopyTextContent), text: '12 Rizal Ave, Paniqui', ...patch }, ...extra }
}

const runtime = (extra: Partial<PageRuntime> = {}): PageRuntime => ({
  page: 'tracking',
  state: 'preparing',
  tokens: { store: 'Lola’s', order_number: '#07', store_address: '88 Mabini St' },
  labels: {},
  blocks: {},
  ...extra,
})

function renderPage(widgets: Widget[], extra: Partial<PageRuntime> = {}, isEditor = false) {
  return render(
    <PageRuntimeProvider value={runtime(extra)}>
      <HeroBuilderRenderer design={designOf([section('s', [column('c', widgets)])])} isEditor={isEditor} />
    </PageRuntimeProvider>,
  )
}

const mockClipboard = (impl = jest.fn().mockResolvedValue(undefined)) => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: impl } })
  return impl
}

describe('Copy text element', () => {
  it('is offered on all three pages, and not by the Hero or Welcome builders', () => {
    for (const page of PAGE_IDS) expect(PAGE_META[page].freeKinds).toContain('copy-text')
    expect(HERO_ADD_GROUPS.flatMap((g) => g.tiles).map((t) => t.kind)).not.toContain('copy-text')
  })

  it('survives saving and loading', () => {
    const design = designOf([section('s', [column('c', [copyWidget({ title: 'Our address' })])])])
    expect(heroDesignV5Schema.safeParse(design).success).toBe(true)
    const loaded = loadHeroDesign(JSON.stringify(design))
    expect(loaded?.sections[0].columns[0].widgets[0].kind).toBe('copy-text')
  })

  it('refuses text too long to be a sensible copy', () => {
    const design = designOf([section('s', [column('c', [copyWidget({ text: 'x'.repeat(301) })])])])
    expect(heroDesignV5Schema.safeParse(design).success).toBe(false)
  })

  it('can publish on every page', () => {
    for (const page of PAGE_IDS) {
      const required = (page === 'checkout' ? ['checkout.place_order'] : []).map((id) => createPageBlock(blockDef(id)!))
      const problem = pageDesignProblem(designOf([section('s', [column('c', [copyWidget(), ...required])])]), page)
      expect(problem ?? '').not.toMatch(/can't use that element/)
    }
  })

  it('copies the text with its tokens filled in, then says Copied', async () => {
    const writeText = mockClipboard()
    renderPage([copyWidget({ text: 'Order {order_number}: {store_address}', title: 'Address' })])
    expect(screen.getByText('Order #07: 88 Mabini St')).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /copy/i })))
    expect(writeText).toHaveBeenCalledWith('Order #07: 88 Mabini St')
    expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument()
  })

  it('tells the customer to press and hold when copying is blocked', async () => {
    mockClipboard(jest.fn().mockRejectedValue(new Error('blocked')))
    Object.defineProperty(document, 'execCommand', { configurable: true, writable: true, value: jest.fn(() => false) })
    renderPage([copyWidget()])
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /copy/i })))
    expect(screen.getByRole('status')).toHaveTextContent(/press and hold/i)
  })

  it.each(['icon', 'button', 'only'] as const)('%s design keeps a working copy button', async (design) => {
    const writeText = mockClipboard()
    renderPage([copyWidget({ design, buttonLabel: 'Copy address' })])
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /copy/i })))
    expect(writeText).toHaveBeenCalledWith('12 Rizal Ave, Paniqui')
  })

  it('shows customers nothing when the text is blank or its token had no value', () => {
    const { container } = renderPage([copyWidget({ text: '{missing_address}', title: 'Address' })], { tokens: { missing_address: '' } })
    expect(container.querySelector('.hb-copy')).toBeNull()
  })

  it('shows the owner a placeholder instead while editing', () => {
    renderPage([copyWidget({ text: '' })], {}, true)
    expect(screen.getByText(/text customers can copy/i)).toBeInTheDocument()
  })

  it('never copies from the editor canvas', async () => {
    const writeText = mockClipboard()
    renderPage([copyWidget()], {}, true)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /copy/i })))
    expect(writeText).not.toHaveBeenCalled()
  })
})

describe('Show for: order type', () => {
  const limited = copyWidget({}, { showFor: ['delivery'] })

  it('reads the kind, shows when no limit or the kind is unknown', () => {
    expect(isShownForOrder(undefined, 'pickup')).toBe(true)
    expect(isShownForOrder([], 'pickup')).toBe(true)
    expect(isShownForOrder(['delivery'], null)).toBe(true)
    expect(isShownForOrder(['delivery'], 'delivery')).toBe(true)
    expect(isShownForOrder(['delivery'], 'pickup')).toBe(false)
    expect(isShownForOrder(['delivery'], 'grab')).toBe(false)
  })

  it('hides an element from other order types on the storefront', () => {
    const { container } = renderPage([limited], { orderKind: 'pickup' })
    expect(container.querySelector('.hb-copy')).toBeNull()
  })

  it('shows an element to its own order type', () => {
    const { container } = renderPage([limited], { orderKind: 'delivery' })
    expect(container.querySelector('.hb-copy')).not.toBeNull()
  })

  it('hides a whole section, heading and all', () => {
    const base = section('s', [column('c', [copyWidget()])])
    const limitedSection: Section = { ...base, showFor: ['delivery'] }
    const { container } = render(
      <PageRuntimeProvider value={runtime({ orderKind: 'dine_in' })}>
        <HeroBuilderRenderer design={designOf([limitedSection])} />
      </PageRuntimeProvider>,
    )
    expect(container.querySelector('.hb-section')).toBeNull()
  })

  it('leaves the rule out of the way while editing', () => {
    const { container } = renderPage([limited], { orderKind: 'pickup' }, true)
    expect(container.querySelector('.hb-copy')).not.toBeNull()
  })

  it('survives saving and loading, dropping unknown kinds', () => {
    const design = designOf([section('s', [column('c', [limited])])])
    expect(heroDesignV5Schema.safeParse(design).success).toBe(true)
    const stored = JSON.parse(JSON.stringify(design))
    stored.sections[0].columns[0].widgets[0].showFor = ['delivery', 'teleport']
    expect(loadHeroDesign(JSON.stringify(stored))?.sections[0].columns[0].widgets[0].showFor).toEqual(['delivery'])
  })

  it('refuses to limit a required block: Place order must show for everyone', () => {
    const placeOrder = { ...createPageBlock(blockDef('checkout.place_order')!), showFor: ['delivery' as const] }
    expect(pageDesignProblem(designOf([section('s', [column('c', [placeOrder])])]), 'checkout')).toMatch(/must show/)
  })
})

describe('{store_address}', () => {
  it('is the order’s branch address, else the store’s, else blank', () => {
    expect(storeAddressToken({ restaurant_address: 'Main' }, { address: 'Branch' })).toBe('Branch')
    expect(storeAddressToken({ restaurant_address: 'Main' }, { address: '  ' })).toBe('Main')
    expect(storeAddressToken({ restaurant_address: 'Main' }, null)).toBe('Main')
    expect(storeAddressToken({ restaurant_address: null }, null)).toBe('')
  })

  it('is listed on every page', () => {
    for (const page of PAGE_IDS) expect(PAGE_META[page].tokens.map((t) => t.token)).toContain('store_address')
  })
})
