/**
 * Reproducer: "the fields are not updating in real time".
 *
 * The configure screen seeded every piece of state from props with `useState`
 * and then never resynced. Three things followed, and each is pinned here:
 *
 *  1. A settings save landed on the server, `router.refresh()` handed back the
 *     new row, and the form kept rendering the pre-save values forever.
 *  2. A checkout field added, renamed, or deleted never appeared in the list —
 *     only a hard reload showed it.
 *  3. The Add/Edit dialog was mounted once, so its `useState` captured the FIRST
 *     field it was ever handed. Opening "Edit" on a second field showed the
 *     first field's values.
 *
 * The fix compares a *signature* of the server row, never object identity: an
 * RSC re-render hands back a fresh object every time, so resetting on identity
 * would wipe what the merchant is mid-way through typing.
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderTypeDetail } from '@/components/admin/order-type-detail'
import type { CustomerFormField, OrderType } from '@/types/database'

const updateOrderTypeAction = jest.fn()
const deleteCustomerFormFieldAction = jest.fn()
const createCustomerFormFieldAction = jest.fn()

jest.mock('@/app/actions/order-types', () => ({
  updateOrderTypeAction: (...args: unknown[]) => updateOrderTypeAction(...args),
  deleteOrderTypeAction: jest.fn(),
  createCustomerFormFieldAction: (...args: unknown[]) => createCustomerFormFieldAction(...args),
  updateCustomerFormFieldAction: jest.fn(),
  deleteCustomerFormFieldAction: (...args: unknown[]) => deleteCustomerFormFieldAction(...args),
  reorderCustomerFormFieldsAction: jest.fn().mockResolvedValue({ success: true }),
}))

jest.mock('@/app/actions/order-type-pricing', () => ({
  setOrderTypeItemPriceAction: jest.fn(),
  clearOrderTypeItemPriceAction: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), back: jest.fn() }),
}))

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}))

beforeAll(() => {
  // Radix Select drives itself with Pointer Events, which jsdom does not implement.
  Element.prototype.hasPointerCapture = jest.fn(() => false)
  Element.prototype.setPointerCapture = jest.fn()
  Element.prototype.releasePointerCapture = jest.fn()
  Element.prototype.scrollIntoView = jest.fn()
})

function makeField(overrides: Partial<CustomerFormField> = {}): CustomerFormField {
  return {
    id: 'f-1',
    tenant_id: 'tenant-1',
    order_type_id: 'ot-1',
    field_name: 'customer_name',
    field_label: 'Full Name',
    field_type: 'text',
    is_required: false,
    placeholder: 'Enter your name',
    order_index: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

type DetailOrderType = OrderType & { customer_form_fields: CustomerFormField[] }

function makeOrderType(overrides: Record<string, unknown> = {}): DetailOrderType {
  return {
    id: 'ot-1',
    tenant_id: 'tenant-1',
    type: 'dine_in',
    name: 'Dine In',
    description: '',
    note: '',
    is_enabled: true,
    available_on_web: true,
    available_on_pos: true,
    pos_markup_percent: null,
    messenger_enabled: true,
    service_charge_enabled: false,
    service_charge_type: 'percentage',
    service_charge_value: 0,
    minimum_order_amount: 0,
    after_billing_payment_enabled: false,
    advance_order_enabled: false,
    advance_order_allow_asap: true,
    advance_order_lead_time_minutes: 30,
    advance_order_max_days_ahead: 7,
    advance_order_slot_interval_minutes: 30,
    order_index: 0,
    customer_form_fields: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as DetailOrderType
}

function renderDetail(orderType: DetailOrderType) {
  return render(
    <OrderTypeDetail
      orderType={orderType}
      tenantId="tenant-1"
      tenantSlug="island-silog"
      menuItems={[]}
      initialPrices={[]}
    />
  )
}

beforeEach(() => {
  updateOrderTypeAction.mockReset().mockResolvedValue({ success: true, data: makeOrderType() })
  deleteCustomerFormFieldAction.mockReset().mockResolvedValue({ success: true })
  createCustomerFormFieldAction.mockReset()
})

describe('OrderTypeDetail — settings resync', () => {
  it('shows a value the server changed under it', async () => {
    const { rerender } = renderDetail(makeOrderType({ name: 'Dine In' }))
    expect(screen.getByLabelText('Name')).toHaveValue('Dine In')

    rerender(
      <OrderTypeDetail
        orderType={makeOrderType({ name: 'Eat In' })}
        tenantId="tenant-1"
        tenantSlug="island-silog"
        menuItems={[]}
        initialPrices={[]}
      />
    )

    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Eat In'))
  })

  it('keeps what the merchant typed when an unchanged row re-renders', async () => {
    const user = userEvent.setup()
    const { rerender } = renderDetail(makeOrderType())

    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Kiosk')

    // A fresh object with identical values — what every RSC re-render produces.
    rerender(
      <OrderTypeDetail
        orderType={makeOrderType()}
        tenantId="tenant-1"
        tenantSlug="island-silog"
        menuItems={[]}
        initialPrices={[]}
      />
    )

    expect(screen.getByLabelText('Name')).toHaveValue('Kiosk')
  })
})

describe('OrderTypeDetail — save bar', () => {
  it('reports saved state until something changes', async () => {
    const user = userEvent.setup()
    renderDetail(makeOrderType())

    expect(screen.getByText(/all changes saved/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Name'), '!')

    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument()
  })

  it('discards back to the saved values', async () => {
    const user = userEvent.setup()
    renderDetail(makeOrderType({ name: 'Dine In' }))

    await user.type(screen.getByLabelText('Name'), ' Deluxe')
    await user.click(screen.getByRole('button', { name: /discard/i }))

    expect(screen.getByLabelText('Name')).toHaveValue('Dine In')
    expect(screen.getByText(/all changes saved/i)).toBeInTheDocument()
  })

  it('goes back to saved once the write lands', async () => {
    const user = userEvent.setup()
    renderDetail(makeOrderType())

    await user.type(screen.getByLabelText('Name'), '!')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(screen.getByText(/all changes saved/i)).toBeInTheDocument())
  })
})

/** The label shows twice — once in the list, once in the live preview. */
function fieldList() {
  return within(screen.getByRole('list', { name: /checkout fields/i }))
}

describe('OrderTypeDetail — checkout fields resync', () => {
  const nameField = makeField()
  const phoneField = makeField({
    id: 'f-2',
    field_name: 'customer_phone',
    field_label: 'Phone Number',
    field_type: 'phone',
    order_index: 1,
  })

  it('shows a field the server added', async () => {
    const { rerender } = renderDetail(makeOrderType({ customer_form_fields: [nameField] }))
    expect(fieldList().queryByText('Phone Number')).not.toBeInTheDocument()

    rerender(
      <OrderTypeDetail
        orderType={makeOrderType({ customer_form_fields: [nameField, phoneField] })}
        tenantId="tenant-1"
        tenantSlug="island-silog"
        menuItems={[]}
        initialPrices={[]}
      />
    )

    await waitFor(() => expect(fieldList().getByText('Phone Number')).toBeInTheDocument())
  })

  it('removes a deleted field without waiting for a reload', async () => {
    const user = userEvent.setup()
    renderDetail(makeOrderType({ customer_form_fields: [nameField, phoneField] }))

    await user.click(screen.getByRole('button', { name: /delete phone number/i }))
    await user.click(screen.getByRole('button', { name: /remove field/i }))

    await waitFor(() => expect(fieldList().queryByText('Phone Number')).not.toBeInTheDocument())
    expect(deleteCustomerFormFieldAction).toHaveBeenCalledWith(
      'f-2',
      'tenant-1',
      'island-silog',
      'ot-1'
    )
  })

  it('puts a refused delete back', async () => {
    deleteCustomerFormFieldAction.mockResolvedValue({ success: false, error: 'nope' })
    const user = userEvent.setup()
    renderDetail(makeOrderType({ customer_form_fields: [nameField, phoneField] }))

    await user.click(screen.getByRole('button', { name: /delete phone number/i }))
    await user.click(screen.getByRole('button', { name: /remove field/i }))

    await waitFor(() => expect(fieldList().getByText('Phone Number')).toBeInTheDocument())
  })
})

describe('OrderTypeDetail — field dialog', () => {
  const nameField = makeField()
  const tableField = makeField({
    id: 'f-9',
    field_name: 'table_number',
    field_label: 'Table Number',
    field_type: 'text',
    order_index: 1,
  })

  it('loads the field that was actually clicked, not the first one opened', async () => {
    const user = userEvent.setup()
    renderDetail(makeOrderType({ customer_form_fields: [nameField, tableField] }))

    await user.click(screen.getByRole('button', { name: /edit full name/i }))
    let dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText(/label customers see/i)).toHaveValue('Full Name')

    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /edit table number/i }))
    dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText(/label customers see/i)).toHaveValue('Table Number')
  })

  it('opens blank for a new field after an edit was abandoned', async () => {
    const user = userEvent.setup()
    renderDetail(makeOrderType({ customer_form_fields: [nameField] }))

    await user.click(screen.getByRole('button', { name: /edit full name/i }))
    let dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /^add field$/i }))
    dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText(/label customers see/i)).toHaveValue('')
  })

  it('shows a newly created field straight away', async () => {
    const created = makeField({ id: 'f-new', field_label: 'Landmark', order_index: 1 })
    createCustomerFormFieldAction.mockResolvedValue({ success: true, data: created })

    const user = userEvent.setup()
    renderDetail(makeOrderType({ customer_form_fields: [nameField] }))

    await user.click(screen.getByRole('button', { name: /^add field$/i }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/label customers see/i), 'Landmark')
    await user.type(within(dialog).getByLabelText(/internal name/i), 'landmark')
    await user.click(within(dialog).getByRole('button', { name: /^add field$/i }))

    await waitFor(() => expect(fieldList().getByText('Landmark')).toBeInTheDocument())
  })
})

/**
 * Concurrency. Every one of these is a way the old code lost a merchant's work
 * without saying so.
 */
describe('OrderTypeDetail — concurrent writes', () => {
  const nameField = makeField()
  const phoneField = makeField({
    id: 'f-2',
    field_name: 'customer_phone',
    field_label: 'Phone Number',
    field_type: 'phone',
    order_index: 1,
  })

  it('does not retype a dirty form when another device saves the same row', async () => {
    const user = userEvent.setup()
    const { rerender } = renderDetail(makeOrderType({ name: 'Dine In' }))

    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Kiosk')

    // Someone else saved a different name to this order type.
    rerender(
      <OrderTypeDetail
        orderType={makeOrderType({ name: 'Eat In' })}
        tenantId="tenant-1"
        tenantSlug="island-silog"
        menuItems={[]}
        initialPrices={[]}
      />
    )

    expect(screen.getByLabelText('Name')).toHaveValue('Kiosk')
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument()
  })

  it('shows the other device\'s value once the merchant discards', async () => {
    const user = userEvent.setup()
    const { rerender } = renderDetail(makeOrderType({ name: 'Dine In' }))

    await user.type(screen.getByLabelText('Name'), ' Deluxe')
    rerender(
      <OrderTypeDetail
        orderType={makeOrderType({ name: 'Eat In' })}
        tenantId="tenant-1"
        tenantSlug="island-silog"
        menuItems={[]}
        initialPrices={[]}
      />
    )

    await user.click(screen.getByRole('button', { name: /discard/i }))

    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Eat In'))
  })

  it('holds the reorder arrows until the write lands, so two cannot race', async () => {
    const { reorderCustomerFormFieldsAction } = jest.requireMock('@/app/actions/order-types')
    let release: (value: { success: boolean }) => void = () => {}
    reorderCustomerFormFieldsAction.mockImplementationOnce(
      () => new Promise<{ success: boolean }>((resolve) => { release = resolve })
    )

    const user = userEvent.setup()
    renderDetail(makeOrderType({ customer_form_fields: [nameField, phoneField] }))

    await user.click(screen.getByRole('button', { name: /move phone number up/i }))

    // A full-order write is in flight; a second one would race it and silently
    // undo part of the move.
    expect(screen.getByRole('button', { name: /move phone number down/i })).toBeDisabled()

    release({ success: true })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /move phone number down/i })).toBeEnabled()
    )
  })
})
