/**
 * Page layouts: step by step (one section at a time, Next checks the step),
 * folding panels, a section pinned to the bottom on every step, and the
 * editor showing every section with its step badge.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import { createSection, createWidget } from '@/lib/hero-builder/defaults'
import type { HeroDesignV5, Section } from '@/lib/hero-builder/types'
import { HeroBuilderRenderer } from '@/components/hero-builder/renderer/hero-builder-renderer'
import { PageRuntimeProvider, type PageRuntime } from '@/components/hero-builder/renderer/page-runtime'
import { checkoutStepProblem } from '@/components/page-designer/checkout/checkout-step-problem'
import { createPageBlock } from '@/lib/page-designer/design-blocks'
import { pageBlockDef } from '@/lib/page-designer/blocks'

function textSection(label: string, text: string, extra: Partial<Section> = {}): Section {
  const section = createSection([100], label)
  const widget = createWidget('text')
  return {
    ...section,
    ...extra,
    columns: [{ ...section.columns[0], widgets: [{ ...widget, content: { kind: 'text', text } } as typeof widget] }],
  }
}

function design(layout: 'steps' | 'accordion', sections: Section[]): HeroDesignV5 {
  return { version: 5, theme: { colors: {}, headingFont: '', bodyFont: '', buttonRadius: 10 }, sections, page: { layout } }
}

function renderPage(d: HeroDesignV5, runtime: Partial<PageRuntime> = {}, isEditor = false) {
  const value: PageRuntime = { page: 'checkout', state: null, tokens: {}, labels: {}, blocks: {}, ...runtime }
  return render(
    <PageRuntimeProvider value={value}>
      <HeroBuilderRenderer design={d} isEditor={isEditor} />
    </PageRuntimeProvider>,
  )
}

const isShown = (text: string) => !screen.getByText(text).closest('[hidden]')

describe('step by step', () => {
  const sections = [textSection('How', 'Pick pickup'), textSection('You', 'Your name'), textSection('Bar', 'Place order now', { pin: 'bottom' })]

  it('shows one step at a time, the pinned bar on every step', () => {
    renderPage(design('steps', sections))
    expect(isShown('Pick pickup')).toBe(true)
    expect(isShown('Your name')).toBe(false)
    expect(isShown('Place order now')).toBe(true)
    // Two steps (the pinned bar is not a step).
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('paints upcoming step dots from the text colour, never the store border', () => {
    // A black store border (sample-demo) turned every upcoming dot black with a
    // muted number on it; form lines already follow the text colour for this reason.
    renderPage(design('steps', sections))
    const upcoming = screen.getByLabelText('You', { selector: '[data-part="step"]' })
    expect(upcoming.getAttribute('style') ?? '').not.toContain('--co-border')
    expect(upcoming.getAttribute('style') ?? '').toContain('color-mix')
  })

  it('Next asks the page about the step and shows the reason', () => {
    const stepProblem = jest.fn().mockReturnValueOnce('Please choose how you’ll get your order').mockReturnValue(null)
    renderPage(design('steps', sections), { stepProblem })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Please choose how')
    expect(isShown('Pick pickup')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(isShown('Your name')).toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()
    // The last step has no Next (its own button places the order); Back returns.
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(isShown('Pick pickup')).toBe(true)
  })

  it('uses the owner’s Next words', () => {
    renderPage({ ...design('steps', sections), page: { layout: 'steps', nextLabel: 'Sunod' } })
    expect(screen.getByRole('button', { name: 'Sunod' })).toBeInTheDocument()
  })

  it('is ignored outside a page (a hero never steps)', () => {
    render(<HeroBuilderRenderer design={design('steps', sections)} />)
    expect(isShown('Your name')).toBe(true)
  })

  it('the editor shows every section with its step badge', () => {
    renderPage(design('steps', sections), {}, true)
    expect(isShown('Your name')).toBe(true)
    expect(screen.getByText('Step 1 · How')).toBeInTheDocument()
    expect(screen.getByText('Pinned to the bottom of the screen')).toBeInTheDocument()
  })
})

describe('folding panels', () => {
  it('opens one panel, Continue checks it and opens the next, done panels can be reopened', () => {
    const stepProblem = jest.fn().mockReturnValue(null)
    renderPage(design('accordion', [textSection('How', 'Pick pickup'), textSection('You', 'Your name')]), { stepProblem })
    expect(isShown('Pick pickup')).toBe(true)
    expect(isShown('Your name')).toBe(false)
    expect(screen.getByRole('button', { name: /You/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(isShown('Your name')).toBe(true)
    expect(screen.getByText('Edit')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /How/ }))
    expect(isShown('Pick pickup')).toBe(true)
  })
})

describe('a step or panel with nothing to show', () => {
  // A block that has nothing for this order, the way Schedule does without pre-orders.
  const nothing = () => null
  const blankSection = (label: string): Section => {
    const section = createSection([100], label)
    return { ...section, columns: [{ ...section.columns[0], widgets: [createPageBlock(pageBlockDef('checkout', 'checkout.schedule')!)] }] }
  }
  const blocks = { 'checkout.schedule': nothing }

  it('takes no room on a scrolling page', async () => {
    const { container } = renderPage({ ...design('steps', [textSection('How', 'Pick pickup'), blankSection('When')]), page: undefined }, { blocks })
    await waitFor(() => expect(container.querySelector('section[aria-label="When"]')?.parentElement).toHaveStyle({ display: 'none' }))
    expect(container.querySelector('section[aria-label="How"]')?.parentElement).toHaveStyle({ display: 'contents' })
  })

  it('keeps an owner’s own band with nothing but a spacer in it', async () => {
    const band = createSection([100], 'Band')
    const spaced: Section = { ...band, columns: [{ ...band.columns[0], widgets: [createWidget('spacer')] }] }
    const { container } = renderPage({ ...design('steps', [spaced]), page: undefined })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(container.querySelector('section[aria-label="Band"]')?.parentElement).toHaveStyle({ display: 'contents' })
  })

  it('is not a step', async () => {
    renderPage(design('steps', [textSection('How', 'Pick pickup'), blankSection('When'), textSection('Pay', 'Choose how to pay')]), { blocks })
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(isShown('Choose how to pay')).toBe(true)
    expect(screen.getByText('Step 2 of 2: Pay')).toBeInTheDocument()
  })

  it('hands over to the next step, not the first, when the customer’s step comes up empty', async () => {
    const when = blankSection('When')
    const sections = [textSection('How', 'Pick pickup'), when, textSection('Pay', 'Choose how to pay')]
    const page = (block: () => ReactNode) => (
      <PageRuntimeProvider value={{ page: 'checkout', state: null, tokens: {}, labels: {}, blocks: { 'checkout.schedule': block } }}>
        <HeroBuilderRenderer design={design('steps', sections)} />
      </PageRuntimeProvider>
    )
    const { rerender } = render(page(() => <p>When to come</p>))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(isShown('When to come')).toBe(true)
    rerender(page(() => null))
    await waitFor(() => expect(isShown('Choose how to pay')).toBe(true))
    expect(isShown('Pick pickup')).toBe(false)
  })

  it('is not a panel', async () => {
    const { container } = renderPage(design('accordion', [textSection('How', 'Pick pickup'), blankSection('When'), textSection('Pay', 'Choose how to pay')]), { blocks })
    await waitFor(() => expect(container.querySelectorAll('[data-layout-section]:not([hidden])')).toHaveLength(2))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(isShown('Choose how to pay')).toBe(true)
  })
})

describe('placing the order from a pinned bar', () => {
  const Place = () => <button type="button" data-place-order onClick={placed}>Place order</button>
  const placed = jest.fn()
  const bar = (): Section => {
    const section = { ...createSection([100], 'Bar'), pin: 'bottom' as const }
    return { ...section, columns: [{ ...section.columns[0], widgets: [createPageBlock(pageBlockDef('checkout', 'checkout.place_order')!)] }] }
  }
  const blocks = { 'checkout.place_order': Place }
  const sections = () => [textSection('How', 'Pick pickup'), textSection('You', 'Your name'), bar()]
  // Only the second step is unfinished: it has no blocks of its own in this page, so ask by call.
  const onlySecond = () => jest.fn().mockReturnValueOnce(null).mockReturnValueOnce('Please fill in: Name').mockReturnValue(null)

  beforeEach(() => placed.mockReset())

  it('opens the unfinished step with its reason instead of placing it', () => {
    renderPage(design('steps', sections()), { blocks, stepProblem: onlySecond() })
    fireEvent.click(screen.getByRole('button', { name: 'Place order' }))
    expect(placed).not.toHaveBeenCalled()
    expect(isShown('Your name')).toBe(true)
    expect(screen.getByRole('alert')).toHaveTextContent('Please fill in: Name')
  })

  it('opens the unfinished panel with its reason, the last one too', () => {
    renderPage(design('accordion', sections()), { blocks, stepProblem: onlySecond() })
    fireEvent.click(screen.getByRole('button', { name: 'Place order' }))
    expect(placed).not.toHaveBeenCalled()
    expect(isShown('Your name')).toBe(true)
    expect(screen.getByRole('alert')).toHaveTextContent('Please fill in: Name')
  })

  it('keeps the bar’s wrapper out of the box tree, or it could never stick', () => {
    const { container } = renderPage(design('steps', sections()), { blocks })
    expect(container.querySelector('section[data-pin="bottom"]')?.parentElement).toHaveClass('contents')
  })

  it('places it once every step is finished', () => {
    renderPage(design('steps', sections()), { blocks, stepProblem: () => null })
    fireEvent.click(screen.getByRole('button', { name: 'Place order' }))
    expect(placed).toHaveBeenCalledTimes(1)
  })
})

describe('checkoutStepProblem', () => {
  const base = {
    formFields: [{ field_name: 'customer_name', field_label: 'Name', field_type: 'text', is_required: true }],
    customerData: {} as Record<string, string>,
    orderType: 'pickup',
    advanceConfig: { enabled: false, allowAsap: true },
    scheduleMode: 'asap',
    scheduledForLabel: null,
    isScheduleValid: true,
    paymentMethods: [{ id: 'gcash' }],
    selectedPaymentMethod: '',
    tenant: { qr_handoff_enabled: false },
    shouldAskFulfillment: true,
  } as unknown as Parameters<typeof checkoutStepProblem>[0]

  it('checks only the blocks on the step', () => {
    expect(checkoutStepProblem(base, ['checkout.summary'])).toBeNull()
    expect(checkoutStepProblem(base, ['checkout.customer'])).toMatch(/Name/)
    expect(checkoutStepProblem(base, ['checkout.payment'])).toMatch(/pay/)
    expect(checkoutStepProblem({ ...base, orderType: '' } as typeof base, ['checkout.order_type'])).toMatch(/how you’ll get/)
    expect(checkoutStepProblem({ ...base, customerData: { customer_name: 'Ana' }, selectedPaymentMethod: 'gcash' } as typeof base, ['checkout.customer', 'checkout.payment'])).toBeNull()
  })

  it('asks for a time when the store only takes scheduled orders', () => {
    const scheduledOnly = { ...base, advanceConfig: { enabled: true, allowAsap: false } } as typeof base
    expect(checkoutStepProblem(scheduledOnly, ['checkout.schedule'])).toMatch(/date & time/)
    expect(checkoutStepProblem({ ...scheduledOnly, scheduleMode: 'scheduled', scheduledForLabel: 'Fri 2pm' } as typeof base, ['checkout.schedule'])).toBeNull()
  })
})

it('a pinned section is marked for the sticky rule', () => {
  const def = pageBlockDef('checkout', 'checkout.place_order')!
  const section = { ...createSection([100], 'Bar'), pin: 'bottom' as const }
  const pinned: Section = { ...section, columns: [{ ...section.columns[0], widgets: [createPageBlock(def)] }] }
  const { container } = renderPage({ ...design('steps', [pinned]), page: undefined })
  expect(container.querySelector('section[data-pin="bottom"]')).not.toBeNull()
  expect(container.querySelector('style')?.textContent).toContain('[data-pin="bottom"]{position:sticky')
})
