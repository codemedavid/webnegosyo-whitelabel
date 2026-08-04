/**
 * A discounted order, as the merchant reads it back.
 *
 * `order.total` is stored NET of the discount on every backend, so the one
 * derivation that looks obvious — `subtotal = total − deliveryFee` — is wrong
 * the moment a voucher exists: the "Subtotal" then disagrees with the item
 * lines printed directly above it and nothing on screen explains the gap. That
 * bug shipped once (fixed in this dialog, and again for the Messenger ticket in
 * PR #32), which is why it is pinned here at the rendered-DOM level rather than
 * only in `orderSummaryRows`' own unit tests.
 *
 * `readOrderDiscount` and `orderSummaryRows` run for real. Only the dialog's
 * two child panels — which open Supabase and Lalamove — are stubbed.
 */

import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { OrderDetailDialog } from '@/components/admin/order-detail-dialog'
import type { OrderWithItems } from '@/lib/orders-service'
import type { OrderDiscountPayload } from '@/lib/order-discount'

jest.mock('@/components/admin/order-status-management', () => ({
  OrderStatusManagement: () => <div data-testid="status-management" />,
}))

jest.mock('@/components/admin/order-items-display', () => ({
  OrderItemsDisplay: () => <div data-testid="items-display" />,
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))

const item = (name: string, quantity: number, subtotal: number) => ({
  id: `oi-${name}`,
  menu_item_name: name,
  variation: null,
  addons: [],
  quantity,
  price: subtotal / quantity,
  subtotal,
  special_instructions: null,
})

const SAVE100: OrderDiscountPayload = {
  total: 100,
  deliveryDiscount: 0,
  lines: [{ label: 'Hundred off', amount: 100, code: 'SAVE100' }],
  allocationsByLine: { 'oi-Tapsilog': 100 },
}

/**
 * ₱600 of food, ₱50 delivery, ₱100 off. The merchant is owed ₱550, and that is
 * what `total` holds — already net.
 */
const order = (overrides: Partial<OrderWithItems> = {}): OrderWithItems =>
  ({
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    tenant_id: 'tenant-1',
    order_type: 'delivery',
    customer_name: 'Juan Dela Cruz',
    customer_data: { discount: SAVE100 },
    status: 'pending',
    payment_status: 'pending',
    created_at: '2026-08-01T02:00:00.000Z',
    updated_at: '2026-08-01T02:00:00.000Z',
    delivery_fee: 50,
    total: 550,
    order_items: [item('Tapsilog', 2, 400), item('Iced Tea', 2, 200)],
    ...overrides,
  }) as unknown as OrderWithItems

function renderDialog(value: OrderWithItems) {
  return render(
    <OrderDetailDialog order={value} tenantSlug="acme" tenantId="tenant-1" onClose={jest.fn()} />,
  )
}

/** The summary block, so the header's own total is never mistaken for a row. */
function summary(): HTMLElement {
  return screen.getByText('Order Summary').parentElement as HTMLElement
}

/** The peso figure on the row whose label matches. */
function rowAmount(label: string | RegExp): string {
  const cell = within(summary()).getByText(label)
  return cell.parentElement!.querySelector('span:last-child')!.textContent!.trim()
}

describe('a discounted order in the admin dialog', () => {
  it('names the voucher on its own deduction row', () => {
    renderDialog(order())

    expect(rowAmount('Hundred off')).toBe('−₱100.00')
  })

  it('sums the subtotal from the ITEMS, never from total − delivery', () => {
    // total − delivery would be 550 − 50 = ₱500: plausible, wrong, and
    // unreconcilable against the ₱600 of items listed above it.
    renderDialog(order())

    expect(rowAmount(/^Subtotal/)).toBe('₱600.00')
    expect(rowAmount(/^Subtotal/)).not.toBe('₱500.00')
  })

  it('shows rows that add up to the total actually charged', () => {
    renderDialog(order())

    const peso = (text: string) => Number(text.replace(/[^\d.]/g, ''))

    const subtotal = peso(rowAmount(/^Subtotal/))
    const discount = peso(rowAmount('Hundred off'))
    const delivery = peso(rowAmount('Delivery fee'))
    const total = peso(rowAmount('Total'))

    expect(total).toBe(550)
    expect(subtotal - discount + delivery).toBe(total)
  })

  /**
   * FAILING ON PURPOSE — this documents a defect that is still in the code.
   *
   * `orderSummaryRows` has no service-charge row, but `order.total` includes
   * the service charge (see `orders-service.ts`, which sums it into
   * `computeOrderTotals`). A dine-in order with a ₱60 service charge and a
   * ₱100 voucher therefore renders:
   *
   *     Subtotal (1 items)   ₱600.00
   *     Hundred off         −₱100.00
   *     Total                ₱560.00
   *
   * — a ₱60 gap with nothing on screen accounting for it. It is the same
   * failure `orderSummaryRows` was written to prevent, one row over, and the
   * discount row is what makes it visible: before vouchers there was no
   * subtotal row at all on a non-delivery order, so nothing was auditable.
   *
   * Not fixed here: this is a test-only worktree.
   */
  it('accounts for a service charge, so a dine-in order still reconciles', () => {
    renderDialog(
      order({
        order_type: 'dine_in',
        delivery_fee: 0,
        service_charge_amount: 60,
        total: 560,
        order_items: [item('Tapsilog', 1, 600)],
      } as Partial<OrderWithItems>),
    )

    const peso = (text: string) => Number(text.replace(/[^\d.]/g, ''))
    const subtotal = peso(rowAmount(/^Subtotal/))
    const discount = peso(rowAmount('Hundred off'))
    const serviceCharge = peso(rowAmount(/Service charge/i))

    expect(subtotal - discount + serviceCharge).toBe(peso(rowAmount('Total')))
  })

  it('counts the items, so the subtotal says what it is a subtotal OF', () => {
    renderDialog(order())

    expect(within(summary()).getByText('Subtotal (4 items)')).toBeInTheDocument()
  })

  it('still explains a free-delivery voucher, which has no line of its own', () => {
    // The payload total exceeds its lines. Dropping the difference would leave
    // rows that cannot be reconciled.
    renderDialog(
      order({
        customer_data: {
          discount: {
            total: 150,
            deliveryDiscount: 50,
            lines: [{ label: 'Hundred off', amount: 100, code: 'SAVE100' }],
            allocationsByLine: {},
          },
        },
        total: 500,
      } as Partial<OrderWithItems>),
    )

    expect(rowAmount('Hundred off')).toBe('−₱100.00')
    expect(rowAmount('Discount')).toBe('−₱50.00')
  })

  it('reads a discount written to the column as well as the blob', () => {
    // A tenant migrated from Convex to Postgres can carry both.
    renderDialog(
      order({
        customer_data: {},
        discount_data: SAVE100,
      } as unknown as Partial<OrderWithItems>),
    )

    expect(rowAmount('Hundred off')).toBe('−₱100.00')
  })
})

describe('an ordinary order is unchanged', () => {
  it('renders no discount row at all', () => {
    renderDialog(order({ customer_data: {}, total: 650 }))

    expect(within(summary()).queryByText('Hundred off')).not.toBeInTheDocument()
    expect(within(summary()).queryByText('Discount')).not.toBeInTheDocument()
    expect(rowAmount('Total')).toBe('₱650.00')
  })

  it('drops a corrupt deduction rather than showing the shop charging extra', () => {
    renderDialog(
      order({
        customer_data: {
          discount: { total: 0, deliveryDiscount: 0, lines: [{ label: 'Bad', amount: -100 }], allocationsByLine: {} },
        },
        total: 650,
      } as Partial<OrderWithItems>),
    )

    expect(within(summary()).queryByText('Bad')).not.toBeInTheDocument()
    expect(rowAmount('Total')).toBe('₱650.00')
  })

  it('shows no subtotal line for a plain pickup order with nothing in between', () => {
    // Repeating the items' own sum immediately above the identical total is
    // noise; the row earns its place only when something sits between them.
    renderDialog(order({ customer_data: {}, delivery_fee: 0, order_type: 'pick_up', total: 600 }))

    expect(within(summary()).queryByText(/^Subtotal/)).not.toBeInTheDocument()
    expect(rowAmount('Total')).toBe('₱600.00')
  })
})
