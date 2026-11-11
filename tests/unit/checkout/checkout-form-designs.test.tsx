/**
 * The checkout form's designs and the delivery address's settings (Page
 * Designer → Customer details): the box follows the form's own width, the
 * newer designs never paint boxes in the store's border colour, and the map
 * can be moved or hidden, except on a store whose fee needs the pin.
 */

import { fireEvent, render, screen } from '@testing-library/react'

import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import { resolveAddressMap } from '@/lib/checkout/address-map'
import { FIELD_STYLES } from '@/lib/page-designer/checkout-block-options'
import { CheckoutFields } from '@/components/customer/checkout-templates/checkout-primitives'
import { fieldStyleSpec, type CheckoutFieldsLook } from '@/components/customer/checkout-templates/field-styles'
import { buildSampleCheckout } from '@/components/page-designer/checkout/sample-checkout'

jest.mock('next/dynamic', () => () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/components/shared/address-autocomplete').AddressAutocomplete
})

const ADDRESS = { id: 'f-address', field_name: 'delivery_address', field_label: 'Delivery Address', field_type: 'text', is_required: true, placeholder: 'Search your street', options: null }
const NAME = { id: 'f-name', field_name: 'customer_name', field_label: 'Name', field_type: 'text', is_required: true, placeholder: null, options: null }
const NOTE = { id: 'f-note', field_name: 'kitchen', field_label: 'Kitchen note', field_type: 'text', is_required: false, placeholder: null, options: null }

const originalProvider = process.env.NEXT_PUBLIC_MAPS_PROVIDER
const originalToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  process.env.NEXT_PUBLIC_MAPS_PROVIDER = 'mapbox'
  process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN = 'pk.test'
})

afterEach(() => {
  jest.restoreAllMocks()
  process.env.NEXT_PUBLIC_MAPS_PROVIDER = originalProvider
  process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN = originalToken
})

function renderForm(look: Partial<CheckoutFieldsLook> | null, fields: unknown[] = [NAME, ADDRESS], overrides: Record<string, unknown> = {}, customerData: Record<string, string> = {}) {
  const sample = buildSampleCheckout(null)
  const checkout = {
    ...sample,
    customerData,
    tenant: { ...sample.tenant, mapbox_enabled: true, ...overrides },
    formFields: fields,
  } as unknown as UseCheckoutReturn
  return render(
    <CheckoutFields
      checkout={checkout}
      showLoyalty={false}
      showSmsOptIn={false}
      look={look ? { style: 'clean', corners: 'auto', ...look } : undefined}
    />,
  )
}

describe('layout', () => {
  it('a designed form lays out by its own width, so a phone frame shows one column', () => {
    const { container } = renderForm({})
    expect(container.querySelector('.\\@container')).not.toBeNull()
    expect(container.querySelector('[class*="@lg:grid-cols-2"]')).not.toBeNull()
    expect(container.querySelector('[class*="md:grid-cols-2"]')).toBeNull()
  })

  it('the standard checkout keeps its screen breakpoints', () => {
    const { container } = renderForm(null)
    expect(container.querySelector('.\\@container')).toBeNull()
    expect(container.querySelector('[class*="md:grid-cols-2"]')).not.toBeNull()
  })

  it('the phone box leaves room for its counter, so the two never overlap', () => {
    const { container } = renderForm({}, [{ ...NAME, field_type: 'phone' }], { lalamove_market: 'PH' })
    expect(container.querySelector('input[type="tel"]')?.className).toContain('pr-14')
  })
})

describe('designs', () => {
  it.each(['clean', 'label_inside', 'sheet', 'ruled', 'tinted', 'roomy'] as const)('%s is offered and never paints in the store’s border colour', (style) => {
    expect(FIELD_STYLES.map((s) => s.value)).toContain(style)
    const spec = fieldStyleSpec({ style, corners: 'auto' })
    const painted = [spec.box, spec.cell, spec.group, spec.row, spec.addressBox].filter(Boolean).join(' ')
    expect(painted).not.toContain('--co-border')
    // 16px or larger: iOS zooms the page on anything smaller.
    expect(`${spec.box} ${spec.addressBox ?? ''}`).toMatch(/text-base|text-\[17px\]/)
  })

  it('the first design stays the original, so stored designs don’t change', () => {
    expect(FIELD_STYLES[0].value).toBe('outlined')
  })

  it('label inside: the question frames its label and answer, the address keeps its own box', () => {
    renderForm({ style: 'label_inside' })
    expect(screen.getByLabelText(/Name/).closest('[data-question]')?.className).toContain('focus-within:')
    expect(screen.getByPlaceholderText('Search your street').closest('[data-question]')?.className).not.toContain('focus-within:')
  })
})

describe('marks', () => {
  it('stars the required questions by default', () => {
    renderForm({}, [NAME, NOTE])
    expect(screen.getByText('*')).toBeInTheDocument()
    expect(screen.queryByText('(optional)')).toBeNull()
  })

  it('can say what is optional instead', () => {
    renderForm({ marks: 'optional' }, [NAME, NOTE])
    expect(screen.queryByText('*')).toBeNull()
    expect(screen.getByText('(optional)')).toBeInTheDocument()
  })
})

describe('delivery address', () => {
  it('hidden: a typed address with no map buttons', () => {
    const { container } = renderForm({ addressMap: 'hidden' })
    expect(screen.getByPlaceholderText('Search your street')).toBeInTheDocument()
    expect(container.querySelector('[data-part="button-alt"]')).toBeNull()
  })

  it.each([
    [{ lalamove_enabled: true }],
    [{ distance_delivery_enabled: true }],
  ])('a store whose fee needs the pin keeps the map: %j', (store) => {
    expect(resolveAddressMap('hidden', store)).toBe('links')
    expect(resolveAddressMap('hidden', {})).toBe('hidden')
    expect(resolveAddressMap(undefined, store)).toBe('buttons')
    expect(resolveAddressMap('map', store)).toBe('map')
  })

  it('details are always there by default', () => {
    renderForm({})
    expect(screen.getByLabelText(/Landmark/)).toBeInTheDocument()
  })

  it('details can wait behind a link', () => {
    renderForm({ addressDetails: 'tucked' })
    expect(screen.queryByLabelText(/Landmark/)).toBeNull()
    const open = screen.getByRole('button', { name: /add unit, landmark or a note/i })
    expect(open).toHaveAttribute('data-part', 'link')
    fireEvent.click(open)
    expect(screen.getByLabelText(/Landmark/)).toBeInTheDocument()
  })

  it('an answer is never tucked out of sight', () => {
    renderForm({ addressDetails: 'tucked' }, [ADDRESS], {}, { delivery_landmark: 'Blue gate' })
    expect(screen.getByLabelText(/Landmark/)).toHaveValue('Blue gate')
  })
})
