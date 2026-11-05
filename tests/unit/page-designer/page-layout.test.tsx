/**
 * Page layouts: step by step (one section at a time, Next checks the step),
 * folding panels, a section pinned to the bottom on every step, and the
 * editor showing every section with its step badge.
 */

import { fireEvent, render, screen } from '@testing-library/react'

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
