/**
 * The v3 payment designs — chosen + Change, accordion, pay now / later —
 * over a checkout that really keeps the choice (a stateful harness), plus
 * the payment block's show switches in every design.
 */

import { fireEvent, render, screen, within } from '@testing-library/react'
import { useMemo, useState } from 'react'

import { HeroBuilderRenderer } from '@/components/hero-builder/renderer/hero-builder-renderer'
import { PageRuntimeProvider, type PageRuntime } from '@/components/hero-builder/renderer/page-runtime'
import { CheckoutBlocksProvider } from '@/components/page-designer/checkout/checkout-blocks-context'
import { CHECKOUT_LIVE_BLOCKS } from '@/components/page-designer/checkout/checkout-live-blocks'
import { buildSampleCheckout } from '@/components/page-designer/checkout/sample-checkout'
import { PAYMENT_DESIGNS } from '@/lib/page-designer/checkout-block-options'
import { createStandardDesign, standardSection } from '@/lib/page-designer/standard-designs'
import type { HeroDesignV5, PageBlockContent } from '@/lib/hero-builder/types'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }))

const runtime: PageRuntime = { page: 'checkout', state: null, tokens: { store: 'Island Silog' }, labels: {}, blocks: CHECKOUT_LIVE_BLOCKS }

const GCASH = { id: 'sample-gcash', name: 'GCash', details: 'Number: 0917 123 4567', qr_code_url: null, require_payment_proof: true }
const MAYA = { id: 'sample-maya', name: 'Maya', details: null, qr_code_url: 'https://example.com/maya.png', require_payment_proof: false }
const CASH = { id: 'sample-cash', name: 'Cash', details: null, qr_code_url: null, require_payment_proof: false, skip_payment_details: true }

/** A page holding only the payment block, with `options` and `texts`. */
function paymentDesign(options: Record<string, unknown>, texts: Record<string, string> = {}): HeroDesignV5 {
  const section = standardSection('checkout', ['checkout.payment'])
  return {
    ...createStandardDesign('checkout'),
    sections: [
      {
        ...section,
        columns: section.columns.map((c) => ({
          ...c,
          widgets: c.widgets.map((w) => ({ ...w, content: { ...(w.content as PageBlockContent), options, texts } })),
        })),
      },
    ],
  } as HeroDesignV5
}

interface HarnessProps {
  options: Record<string, unknown>
  texts?: Record<string, string>
  methods?: readonly Record<string, unknown>[]
  initial?: string | null
  overrides?: Record<string, unknown>
  onSelect?: (id: string | null) => void
}

/** The payment block over a checkout whose choice really changes. */
function Harness({ options, texts, methods = [GCASH, CASH], initial = 'sample-gcash', overrides = {}, onSelect }: HarnessProps) {
  const [selected, setSelected] = useState<string | null>(initial)
  // One design for the whole test, as on the storefront (a new one each render would remount the block).
  const design = useMemo(() => paymentDesign(options, texts), [options, texts])
  const checkout = {
    ...buildSampleCheckout(null, 'Island Silog'),
    paymentMethods: methods,
    selectedPaymentMethod: selected,
    setSelectedPaymentMethod: (id: string | null) => {
      onSelect?.(id)
      setSelected(id)
    },
    ...overrides,
  } as unknown as UseCheckoutReturn
  return (
    <PageRuntimeProvider value={runtime}>
      <CheckoutBlocksProvider value={{ checkout }}>
        <HeroBuilderRenderer design={design} />
      </CheckoutBlocksProvider>
    </PageRuntimeProvider>
  )
}

const designs = PAYMENT_DESIGNS.map((d) => d.value)

describe('payment designs', () => {
  it('appends the three new designs after the first three', () => {
    expect(designs).toEqual(['wallet', 'grid', 'rows', 'chosen', 'accordion', 'split'])
  })

  describe('chosen + Change', () => {
    it('shows only the chosen method until Change opens the list', () => {
      render(<Harness options={{ variant: 'chosen' }} />)
      expect(screen.queryAllByRole('radio')).toHaveLength(0)
      expect(screen.getByText('GCash')).toBeInTheDocument()
      expect(screen.getByText('Pay with GCash')).toBeInTheDocument()
      const change = screen.getByRole('button', { name: 'Change' })
      expect(change).toHaveAttribute('aria-expanded', 'false')
      fireEvent.click(change)
      expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByRole('radio', { name: /GCash/ })).toBeChecked()
    })

    it('picks a method from the list and closes it after a tap', () => {
      const onSelect = jest.fn()
      render(<Harness options={{ variant: 'chosen' }} onSelect={onSelect} />)
      fireEvent.click(screen.getByRole('button', { name: 'Change' }))
      const cash = screen.getByRole('radio', { name: /^Cash$/ })
      fireEvent.pointerDown(cash)
      fireEvent.click(cash)
      expect(onSelect).toHaveBeenCalledWith('sample-cash')
      expect(screen.queryAllByRole('radio')).toHaveLength(0)
      expect(screen.getByText('Pay with Cash')).toBeInTheDocument()
    })

    it('keeps the list open while the keyboard moves the choice', () => {
      render(<Harness options={{ variant: 'chosen' }} />)
      fireEvent.click(screen.getByRole('button', { name: 'Change' }))
      fireEvent.click(screen.getByRole('radio', { name: /^Cash$/ }))
      expect(screen.getByRole('radio', { name: /^Cash$/ })).toBeChecked()
    })

    it('opens with the list when nothing is chosen yet', () => {
      render(<Harness options={{ variant: 'chosen' }} initial={null} />)
      expect(screen.queryByRole('button', { name: 'Change' })).toBeNull()
      expect(screen.getAllByRole('radio')).toHaveLength(2)
    })
  })

  describe('accordion', () => {
    it('opens the chosen row with its details, inside the row', () => {
      const { container } = render(<Harness options={{ variant: 'accordion' }} />)
      const rows = container.querySelectorAll('[data-part="option"]')
      expect(rows).toHaveLength(2)
      expect(within(rows[0] as HTMLElement).getByText('0917 123 4567')).toBeInTheDocument()
      expect(screen.queryByText('Pay with GCash')).toBeNull()
      expect(within(rows[1] as HTMLElement).queryByText('0917 123 4567')).toBeNull()
    })

    it('moves the open row with the choice', () => {
      const onSelect = jest.fn()
      const { container } = render(<Harness options={{ variant: 'accordion' }} methods={[GCASH, MAYA]} onSelect={onSelect} />)
      fireEvent.click(screen.getByRole('radio', { name: /Maya/ }))
      expect(onSelect).toHaveBeenCalledWith('sample-maya')
      const rows = container.querySelectorAll('[data-part="option"]')
      expect(within(rows[1] as HTMLElement).getByRole('button', { name: 'Enlarge Maya QR code' })).toBeInTheDocument()
      expect(within(rows[0] as HTMLElement).queryByText('0917 123 4567')).toBeNull()
    })
  })

  describe('pay now / later', () => {
    it('asks when to pay first, then picks the only in-person method for the customer', () => {
      const onSelect = jest.fn()
      render(<Harness options={{ variant: 'split' }} onSelect={onSelect} />)
      const when = screen.getByRole('radiogroup', { name: 'When to pay' })
      expect(within(when).getByRole('radio', { name: /Pay now/ })).toBeChecked()
      fireEvent.click(within(when).getByRole('radio', { name: /Pay at the counter/ }))
      expect(onSelect).toHaveBeenLastCalledWith('sample-cash')
      expect(screen.getByRole('radio', { name: /Pay at the counter/ })).toBeChecked()
    })

    it('lists the group’s methods when it has several, and the customer picks one', () => {
      const onSelect = jest.fn()
      render(<Harness options={{ variant: 'split' }} methods={[GCASH, MAYA, CASH]} initial="sample-cash" onSelect={onSelect} />)
      fireEvent.click(screen.getByRole('radio', { name: /Pay now/ }))
      expect(onSelect).toHaveBeenLastCalledWith(null)
      fireEvent.click(screen.getByRole('radio', { name: /^Maya/ }))
      expect(onSelect).toHaveBeenLastCalledWith('sample-maya')
      expect(screen.getByRole('radio', { name: /Pay now/ })).toBeChecked()
    })

    it('says “Pay on delivery” for delivery and uses the owner’s wording when set', () => {
      const delivery = { selectedOrderTypeData: { id: 'd', name: 'Delivery', type: 'delivery' } }
      const { unmount } = render(<Harness options={{ variant: 'split' }} overrides={delivery} />)
      expect(screen.getByRole('radio', { name: /Pay on delivery/ })).toBeInTheDocument()
      unmount()
      render(<Harness options={{ variant: 'split' }} texts={{ split_now: 'Pay online', split_in_person: 'Cash on pickup' }} />)
      expect(screen.getByRole('radio', { name: /Pay online/ })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: /Cash on pickup/ })).toBeInTheDocument()
    })

    it('falls back to the plain list when every method is paid the same way', () => {
      render(<Harness options={{ variant: 'split' }} methods={[GCASH, MAYA]} />)
      expect(screen.queryByRole('radiogroup', { name: 'When to pay' })).toBeNull()
      expect(screen.getByRole('radio', { name: /GCash/ })).toBeChecked()
      expect(screen.getByRole('radio', { name: /Maya/ })).toBeInTheDocument()
    })
  })
})

describe('payment show switches', () => {
  const qrGcash = { ...GCASH, qr_code_url: 'https://example.com/gcash.png' }

  it.each(designs)('%s shows every part by default', (variant) => {
    const { container } = render(<Harness options={{ variant }} methods={[qrGcash, CASH]} />)
    expect(screen.getAllByText('Proof required').length).toBeGreaterThan(0)
    expect(screen.getByText('0917 123 4567')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enlarge GCash QR code' })).toBeInTheDocument()
    // Each method's mark: its QR thumbnail, or its letter.
    expect(container.querySelector('[data-part="option"] [data-part="icon"], [data-part="option"] img')).not.toBeNull()
  })

  it.each(designs)('%s hides the marks, details, QR and proof chip when switched off', (variant) => {
    const off = { variant, show_icons: false, show_descriptions: false, show_qr_preview: false, show_proof_chip: false }
    const { container } = render(<Harness options={off} methods={[qrGcash, CASH]} />)
    expect(screen.queryByText('Proof required')).toBeNull()
    expect(screen.queryByText('0917 123 4567')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Enlarge GCash QR code' })).toBeNull()
    // No method marks (a split choice keeps its own group icon).
    const marks = [...container.querySelectorAll('[data-part="icon"]')].filter((el) => el.textContent === 'C')
    expect(marks).toHaveLength(0)
    expect(container.querySelectorAll('img')).toHaveLength(0)
  })
})
