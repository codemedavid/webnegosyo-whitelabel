import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlatformOrdersView } from '@/components/admin/orders-table/platform-orders-view'
import { useRealtimeOrders } from '@/hooks/use-realtime-orders'
import { updateOrderStatusAction } from '@/app/actions/orders'
import { DEFAULT_ORDERS_FILTERS } from '@/lib/admin/orders-table/filters'
import type { OrdersTableData } from '@/lib/admin/orders-table/read-orders-table'
import type { OrderWithItems } from '@/lib/orders-service'

/**
 * The platform Orders table: subscribes with the platform browser client (the
 * per-store Supabase client was removed 2026-11-10 and must not come back),
 * moves an order one step from its row, and keeps every filter in the address.
 */

jest.mock('@/hooks/use-realtime-orders', () => ({
  useRealtimeOrders: jest.fn(() => ({ isConnected: true })),
}))

jest.mock('@/app/actions/orders', () => ({
  updateOrderStatusAction: jest.fn(),
  updatePaymentStatusAction: jest.fn(),
}))

jest.mock('@/app/actions/receipt', () => ({ getReceiptContext: jest.fn() }))

jest.mock('@/lib/notification-utils', () => ({
  playNotificationSound: jest.fn(),
  showOrderNotification: jest.fn(),
  requestNotificationPermission: jest.fn(),
}))

jest.mock('@/components/mascot/owl', () => ({ Owl: () => null }))

const push = jest.fn()
const refresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  usePathname: () => '/admin/orders',
}))

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const mockedHook = useRealtimeOrders as jest.MockedFunction<typeof useRealtimeOrders>
const mockedUpdate = updateOrderStatusAction as jest.MockedFunction<typeof updateOrderStatusAction>

const order = (overrides: Partial<OrderWithItems> = {}): OrderWithItems =>
  ({
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    tenant_id: 'tenant-1',
    daily_number: 7,
    order_type: 'Pickup',
    status: 'pending',
    customer_name: 'Ana Cruz',
    customer_contact: '0917',
    customer_data: {},
    payment_status: 'pending',
    total: 540,
    created_at: new Date().toISOString(),
    order_items: [{ id: 'i1', menu_item_name: 'Burger', quantity: 2, price: 270, subtotal: 540, variation: null, addons: [], special_instructions: null }],
    ...overrides,
  }) as unknown as OrderWithItems

const data = (orders: OrderWithItems[]): OrdersTableData => ({
  orders,
  totalCount: orders.length,
  page: 1,
  pageSize: 25,
  totalPages: 1,
  counts: { pending: 1, confirmed: 0, preparing: 0, ready: 0, delivered: 0, cancelled: 0, all: 1 },
  orderTypes: [],
  outlets: [],
})

function renderView(orders = [order()]) {
  return render(<PlatformOrdersView data={data(orders)} filters={DEFAULT_ORDERS_FILTERS} tenantSlug="acme" tenantId="tenant-1" />)
}

function desktopTable() {
  return screen.getByRole('table')
}

// Radix Select asks for pointer capture and scrolls the chosen option into view; jsdom has neither.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => undefined
  Element.prototype.scrollIntoView ??= () => undefined
})

describe('PlatformOrdersView', () => {
  beforeEach(() => jest.clearAllMocks())

  it('leaves the realtime hook on the platform client', () => {
    renderView()
    expect(mockedHook.mock.calls[0][0].client).toBeUndefined()
    expect(mockedHook.mock.calls[0][0].tenantId).toBe('tenant-1')
  })

  it('moves a new order to confirmed from its row, then refreshes', async () => {
    mockedUpdate.mockResolvedValue({ success: true, data: {} as never })
    renderView()
    await userEvent.click(within(desktopTable()).getByRole('button', { name: 'Confirm order #07' }))
    expect(mockedUpdate).toHaveBeenCalledWith('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'tenant-1', 'acme', 'confirmed')
    expect(refresh).toHaveBeenCalled()
    // The row now offers the following step.
    expect(within(desktopTable()).getByRole('button', { name: 'Start order #07' })).toBeInTheDocument()
  })

  it('puts the status back when the change is refused', async () => {
    mockedUpdate.mockResolvedValue({ success: false, error: 'This order was just updated by someone else.' })
    renderView()
    await userEvent.click(within(desktopTable()).getByRole('button', { name: 'Confirm order #07' }))
    expect(within(desktopTable()).getByRole('button', { name: 'Confirm order #07' })).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('puts a status tab in the address, on page 1', async () => {
    renderView()
    await userEvent.click(screen.getByRole('button', { name: /^Ready/ }))
    expect(push).toHaveBeenCalledWith('/admin/orders?status=ready', { scroll: false })
  })

  it('sends a search after a pause, not on every key', async () => {
    jest.useFakeTimers()
    try {
      renderView()
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      await user.type(screen.getByRole('searchbox', { name: /search/i }), 'Ana')
      expect(push).not.toHaveBeenCalled()
      act(() => {
        jest.advanceTimersByTime(400)
      })
      expect(push).toHaveBeenCalledTimes(1)
      expect(push).toHaveBeenCalledWith('/admin/orders?q=Ana', { scroll: false })
    } finally {
      jest.useRealTimers()
    }
  })

  it('shows the tab counts, the row and the items', () => {
    renderView()
    expect(screen.getByRole('button', { name: /^New/ })).toHaveTextContent('1')
    expect(within(desktopTable()).getByText('Ana Cruz')).toBeInTheDocument()
    expect(within(desktopTable()).getByText('2× Burger')).toBeInTheDocument()
    expect(within(desktopTable()).getByText('Not paid')).toBeInTheDocument()
  })

  it('opens the order beside the table', async () => {
    renderView()
    await userEvent.click(within(desktopTable()).getByText('Ana Cruz'))
    expect(screen.getByRole('dialog')).toHaveTextContent('Order #07')
  })

  it('shows a change from the panel status menu at once, in the panel and the row', async () => {
    mockedUpdate.mockResolvedValue({ success: true, data: {} as never })
    renderView()
    await userEvent.click(within(desktopTable()).getByText('Ana Cruz'))
    const panel = screen.getByRole('dialog')
    await userEvent.click(within(panel).getByRole('combobox', { name: 'Order status' }))
    await userEvent.click(screen.getByRole('option', { name: 'Ready' }))
    expect(mockedUpdate).toHaveBeenCalledWith('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'tenant-1', 'acme', 'ready')
    expect(within(screen.getByRole('dialog')).getByRole('combobox', { name: 'Order status' })).toHaveTextContent('Ready')
    // The table sits behind the modal panel (aria-hidden), so look past that.
    expect(within(screen.getByRole('table', { hidden: true })).getByRole('button', { name: 'Complete order #07', hidden: true })).toBeInTheDocument()
  })
})
