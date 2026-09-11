/**
 * Payment methods must be attachable to EVERY enabled order type.
 *
 * The editor used to be handed the storefront's web-filtered list, so
 * register-only channels (Grab, Foodpanda, a POS-only dine-in) never appeared
 * — the merchant had no way to say which methods those channels take. The two
 * checks here are that such a type is offered at all, and that it is labelled,
 * since "Grab" and "Delivery" are indistinguishable as bare names.
 */

import { render, screen } from '@testing-library/react'
import { PaymentMethodForm } from '@/components/admin/payment-method-form'
import type { OrderType } from '@/types/database'

jest.mock('@/app/actions/payment-methods', () => ({
  createPaymentMethodAction: jest.fn(),
  updatePaymentMethodAction: jest.fn(),
  updatePaymentMethodOrderTypesAction: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), back: jest.fn() }),
}))

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}))

jest.mock('@/components/shared/simple-image-upload', () => ({
  SimpleImageUpload: () => null,
}))

function makeOrderType(overrides: Partial<OrderType> & { id: string; name: string }): OrderType {
  return {
    tenant_id: 'tenant-1',
    type: 'delivery',
    description: '',
    is_enabled: true,
    order_index: 0,
    available_on_web: true,
    available_on_pos: true,
    ...overrides,
  } as unknown as OrderType
}

const orderTypes: OrderType[] = [
  makeOrderType({ id: 'ot-web', name: 'Delivery' }),
  makeOrderType({ id: 'ot-pos', name: 'Grab', available_on_web: false }),
  makeOrderType({ id: 'ot-online', name: 'Online Pickup', available_on_pos: false }),
]

const props = {
  orderTypes,
  tenantId: 'tenant-1',
  tenantSlug: 'demo',
}

describe('PaymentMethodForm — order type availability', () => {
  it('offers a register-only order type as a tickable choice', () => {
    render(<PaymentMethodForm {...props} />)

    expect(screen.getByLabelText('Grab')).toBeInTheDocument()
  })

  it('labels which single channel a restricted order type runs on', () => {
    render(<PaymentMethodForm {...props} />)

    expect(screen.getByText('Register only')).toBeInTheDocument()
    expect(screen.getByText('Online only')).toBeInTheDocument()
  })

  it('leaves a type that runs on both channels unqualified', () => {
    render(<PaymentMethodForm {...props} />)

    const rowFor = (name: string) => screen.getByLabelText(name).closest('div')?.textContent

    expect(rowFor('Delivery')).toBe('Delivery')
    expect(rowFor('Grab')).toContain('Register only')
  })
})
