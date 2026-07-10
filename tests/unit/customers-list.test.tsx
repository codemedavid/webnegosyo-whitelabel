import { render, screen, fireEvent, within } from '@testing-library/react'
import { CustomersList } from '@/components/admin/customers-list'
import type { Customer } from '@/types/database'

/**
 * Behavioural spec for the web-admin "Customers" (Regulars) list.
 *
 * The customer data layer (identity resolution, capture on checkout, aggregate
 * profile, and the admin-scoped `getCustomersByTenant` read) is already built
 * and tested — but nothing renders it. This is the owner-facing presentation:
 * a searchable, sortable list of the tenant's derived customer profiles.
 *
 * CustomersList is a pure presentational client component: it receives an
 * already-loaded `Customer[]` and owns only local UI state (search text, sort
 * order, which row is expanded). No data fetching here — that lives in the
 * server page wrapper around `getCustomersByTenant`.
 */

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: overrides.id ?? 'cust-1',
    tenant_id: 'tenant-1',
    phone_e164: '+639171234567',
    email: null,
    name: 'Ana Cruz',
    first_order_at: '2026-01-01T08:00:00.000Z',
    last_order_at: '2026-07-01T08:00:00.000Z',
    order_count: 3,
    total_spent: 1500,
    average_order_value: 500,
    channels_used: ['pickup'],
    top_items: [{ name: 'Latte', quantity: 6 }],
    sms_consent: false,
    sms_consent_at: null,
    created_at: '2026-01-01T08:00:00.000Z',
    updated_at: '2026-07-01T08:00:00.000Z',
    ...overrides,
  }
}

describe('CustomersList', () => {
  it('shows an empty state when the tenant has no customers yet', () => {
    render(<CustomersList customers={[]} tenantSlug="acme" />)

    expect(screen.getByText(/no customers yet/i)).toBeInTheDocument()
  })

  it('renders a row per customer with name, order count and total spent', () => {
    const customers = [
      makeCustomer({ id: 'a', name: 'Ana Cruz', order_count: 3, total_spent: 1500 }),
      makeCustomer({ id: 'b', name: 'Ben Reyes', order_count: 7, total_spent: 4200, phone_e164: '+639998887777' }),
    ]

    render(<CustomersList customers={customers} tenantSlug="acme" />)

    expect(screen.getByText('Ana Cruz')).toBeInTheDocument()
    expect(screen.getByText('Ben Reyes')).toBeInTheDocument()
    // Order counts rendered.
    expect(screen.getByText(/3 orders/i)).toBeInTheDocument()
    expect(screen.getByText(/7 orders/i)).toBeInTheDocument()
    // Total spent rendered (peso-formatted by formatPrice).
    expect(screen.getByText(/1,500/)).toBeInTheDocument()
    expect(screen.getByText(/4,200/)).toBeInTheDocument()
  })

  it('falls back to the phone number as the display label when the customer has no name', () => {
    const customers = [makeCustomer({ name: null, phone_e164: '+639171234567', email: null })]

    render(<CustomersList customers={customers} tenantSlug="acme" />)

    expect(screen.getByText('+639171234567')).toBeInTheDocument()
  })

  it('falls back to the email as the display label when there is no name and no phone', () => {
    const customers = [makeCustomer({ name: null, phone_e164: null, email: 'ghost@example.com' })]

    render(<CustomersList customers={customers} tenantSlug="acme" />)

    expect(screen.getByText('ghost@example.com')).toBeInTheDocument()
  })

  it('filters the list by name as the owner types in the search box', () => {
    const customers = [
      makeCustomer({ id: 'a', name: 'Ana Cruz' }),
      makeCustomer({ id: 'b', name: 'Ben Reyes', phone_e164: '+639998887777' }),
    ]

    render(<CustomersList customers={customers} tenantSlug="acme" />)

    fireEvent.change(screen.getByPlaceholderText(/search customers/i), {
      target: { value: 'ben' },
    })

    expect(screen.getByText('Ben Reyes')).toBeInTheDocument()
    expect(screen.queryByText('Ana Cruz')).not.toBeInTheDocument()
  })

  it('matches the search against the phone number too', () => {
    const customers = [
      makeCustomer({ id: 'a', name: 'Ana Cruz', phone_e164: '+639171234567' }),
      makeCustomer({ id: 'b', name: 'Ben Reyes', phone_e164: '+639998887777' }),
    ]

    render(<CustomersList customers={customers} tenantSlug="acme" />)

    fireEvent.change(screen.getByPlaceholderText(/search customers/i), {
      target: { value: '9998887777' },
    })

    expect(screen.getByText('Ben Reyes')).toBeInTheDocument()
    expect(screen.queryByText('Ana Cruz')).not.toBeInTheDocument()
  })

  it('re-sorts by total spent (highest first) when the "Top spenders" sort is chosen', () => {
    const customers = [
      makeCustomer({ id: 'a', name: 'Ana Cruz', total_spent: 1500 }),
      makeCustomer({ id: 'b', name: 'Ben Reyes', total_spent: 4200, phone_e164: '+639998887777' }),
    ]

    render(<CustomersList customers={customers} tenantSlug="acme" />)

    fireEvent.click(screen.getByRole('button', { name: /top spenders/i }))

    const names = screen.getAllByTestId('customer-name').map((el) => el.textContent)
    expect(names).toEqual(['Ben Reyes', 'Ana Cruz'])
  })

  it('re-sorts by most frequent (highest order count first)', () => {
    const customers = [
      makeCustomer({ id: 'a', name: 'Ana Cruz', order_count: 2 }),
      makeCustomer({ id: 'b', name: 'Ben Reyes', order_count: 9, phone_e164: '+639998887777' }),
    ]

    render(<CustomersList customers={customers} tenantSlug="acme" />)

    fireEvent.click(screen.getByRole('button', { name: /most frequent/i }))

    const names = screen.getAllByTestId('customer-name').map((el) => el.textContent)
    expect(names).toEqual(['Ben Reyes', 'Ana Cruz'])
  })

  it('shows a no-results message when the search matches no customer', () => {
    const customers = [makeCustomer({ id: 'a', name: 'Ana Cruz' })]

    render(<CustomersList customers={customers} tenantSlug="acme" />)

    fireEvent.change(screen.getByPlaceholderText(/search customers/i), {
      target: { value: 'zzz-nobody' },
    })

    expect(screen.queryByText('Ana Cruz')).not.toBeInTheDocument()
    expect(screen.getByText(/no customers match/i)).toBeInTheDocument()
  })

  it('notes when an opened customer has no recorded items', () => {
    const customers = [makeCustomer({ id: 'a', name: 'Ana Cruz', top_items: [] })]

    render(<CustomersList customers={customers} tenantSlug="acme" />)

    fireEvent.click(screen.getByRole('button', { name: /ana cruz/i }))

    const detail = screen.getByTestId('customer-detail-a')
    expect(within(detail).getByText(/no items recorded/i)).toBeInTheDocument()
  })

  it('reveals a customer\'s most-ordered items when their row is opened', () => {
    const customers = [
      makeCustomer({
        id: 'a',
        name: 'Ana Cruz',
        top_items: [
          { name: 'Latte', quantity: 6 },
          { name: 'Croissant', quantity: 2 },
        ],
      }),
    ]

    render(<CustomersList customers={customers} tenantSlug="acme" />)

    // Top items are hidden until the row is opened.
    expect(screen.queryByText('Latte')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /ana cruz/i }))

    const detail = screen.getByTestId('customer-detail-a')
    expect(within(detail).getByText(/Latte/)).toBeInTheDocument()
    expect(within(detail).getByText(/Croissant/)).toBeInTheDocument()
  })
})
