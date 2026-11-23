import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConvexOrdersTab } from '@/components/admin/convex-orders-tab'
import { useConvexOrders, useUpdateConvexOrderStatus } from '@/hooks/use-convex-orders'
import { notifyConvexLifecycleSync } from '@/lib/customers/web-lifecycle-sync'

/**
 * Convex stores get the same Orders table as platform stores: same rows, same
 * one-tap step (through the Convex mutation, then the platform's loyalty
 * ledger is told), and a branch account sees only its own branch.
 */

jest.mock('@/hooks/use-convex-orders', () => ({
  useConvexOrders: jest.fn(),
  useUpdateConvexOrderStatus: jest.fn(),
}))
jest.mock('@/lib/customers/web-lifecycle-sync', () => ({ notifyConvexLifecycleSync: jest.fn() }))
jest.mock('@/components/admin/convex-order-sheet', () => ({
  ConvexOrderSheet: ({ orderId }: { orderId: string | null }) => (orderId ? <div role="dialog">sheet {orderId}</div> : null),
}))
jest.mock('@/components/mascot/owl', () => ({ Owl: () => null }))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const mutate = jest.fn()
const doc = (overrides: Record<string, unknown> = {}) => ({
  _id: 'k1',
  _creationTime: Date.now() - 60_000,
  dailyNumber: 3,
  customerName: 'Ben',
  customerContact: '0917',
  orderType: 'Dine In',
  status: 'pending',
  total: 297,
  itemCount: 3,
  paymentStatus: 'pending',
  source: 'web',
  customerData: { outlet_id: 'b-1', outlet_name: 'Main' },
  ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
  ;(useUpdateConvexOrderStatus as jest.Mock).mockReturnValue(mutate)
})

describe('ConvexOrdersTab', () => {
  it('lists Convex orders in the shared table', () => {
    ;(useConvexOrders as jest.Mock).mockReturnValue([doc(), doc({ _id: 'k2', dailyNumber: 4, customerName: 'Cara', status: 'ready' })])
    render(<ConvexOrdersTab tenantId="tenant-1" />)
    const table = screen.getByRole('table')
    expect(within(table).getByText('Ben')).toBeInTheDocument()
    expect(within(table).getAllByText('3 items')).toHaveLength(2)
    expect(screen.getByText(/Showing the latest 2 orders/)).toBeInTheDocument()
  })

  it('moves an order one step through Convex and tells the loyalty ledger', async () => {
    ;(useConvexOrders as jest.Mock).mockReturnValue([doc()])
    mutate.mockResolvedValue(null)
    render(<ConvexOrdersTab tenantId="tenant-1" />)
    await userEvent.click(within(screen.getByRole('table')).getByRole('button', { name: 'Confirm order #03' }))
    expect(mutate).toHaveBeenCalledWith({ orderId: 'k1', status: 'confirmed' })
    expect(notifyConvexLifecycleSync).toHaveBeenCalledWith({ tenantId: 'tenant-1', externalOrderId: 'k1', status: 'confirmed' })
  })

  it('asks Convex for one status when a tab is chosen', async () => {
    ;(useConvexOrders as jest.Mock).mockReturnValue([])
    render(<ConvexOrdersTab tenantId="tenant-1" />)
    await userEvent.click(screen.getByRole('button', { name: /^Ready/ }))
    expect(useConvexOrders).toHaveBeenLastCalledWith('ready')
  })

  it("keeps a branch account to its own branch's orders", () => {
    ;(useConvexOrders as jest.Mock).mockReturnValue([doc(), doc({ _id: 'k2', customerName: 'Other', customerData: { outlet_id: 'b-2' } })])
    render(<ConvexOrdersTab tenantId="tenant-1" scope={{ kind: 'branch', outletId: 'b-1' }} />)
    const table = screen.getByRole('table')
    expect(within(table).getByText('Ben')).toBeInTheDocument()
    expect(within(table).queryByText('Other')).toBeNull()
  })

  it('searches the loaded rows by name and by number', async () => {
    ;(useConvexOrders as jest.Mock).mockReturnValue([doc(), doc({ _id: 'k2', dailyNumber: 12, customerName: 'Cara' })])
    render(<ConvexOrdersTab tenantId="tenant-1" />)
    const search = screen.getByRole('searchbox')
    await userEvent.type(search, 'car')
    expect(within(screen.getByRole('table')).queryByText('Ben')).toBeNull()
    await userEvent.clear(search)
    await userEvent.type(search, '#3')
    expect(within(screen.getByRole('table')).getByText('Ben')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).queryByText('Cara')).toBeNull()
  })

  it('opens the order sheet from a row', async () => {
    ;(useConvexOrders as jest.Mock).mockReturnValue([doc()])
    render(<ConvexOrdersTab tenantId="tenant-1" />)
    await userEvent.click(within(screen.getByRole('table')).getByText('Ben'))
    expect(screen.getByRole('dialog')).toHaveTextContent('sheet k1')
  })
})
