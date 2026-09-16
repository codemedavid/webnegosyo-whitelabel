import { StrictMode } from 'react'
import { act, render, screen } from '@testing-library/react'
import * as Sentry from '@sentry/nextjs'
import { getFunctionName, type FunctionReference } from 'convex/server'
import { ConvexDashboardStats } from '@/components/admin/convex-dashboard-stats'

let mockQueryError: Error | null = null
const mockListeners = new Set<() => void>()
const mockStats = { totalOrders: 5, totalRevenue: 250, avgOrderValue: 50 }
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }))
jest.mock('convex/react', () => ({
  ...jest.requireActual('convex/react'),
  ConvexReactClient: jest.fn((url: string) => {
    if (url === 'invalid') throw new Error('Invalid deployment')
    return {
      setAuth: jest.fn(),
      watchQuery: (query: FunctionReference<'query'>) => ({
        localQueryResult: () => {
          if (mockQueryError) throw mockQueryError
          return getFunctionName(query) === 'orders:getDashboardStats' ? mockStats : undefined
        },
        onUpdate: (listener: () => void) => {
          mockListeners.add(listener)
          return () => mockListeners.delete(listener)
        },
        journal: () => undefined,
      }),
    }
  }),
}))

it('keeps menu counts and navigation visible when Convex cannot initialize', () => {
  const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {})
  try {
    render(<ConvexDashboardStats convexUrl="invalid" tenantSlug="store" menuItemsCount={12} availableItemsCount={9} categoriesCount={3} />)
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('9 available')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View Orders' })).toHaveAttribute('href', '/store/admin/orders')
    expect(screen.getByText('Live order data is temporarily unavailable.')).toBeInTheDocument()
  } finally {
    errorLog.mockRestore()
  }
})

it('recovers from a live query failure without a missing provider or hook-order error', () => {
  const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {})
  const props = { tenantSlug: 'store', menuItemsCount: 12, availableItemsCount: 9, categoriesCount: 3 }
  try {
    const view = render(<StrictMode><ConvexDashboardStats {...props} convexUrl="https://live.convex.cloud" /></StrictMode>)
    expect(screen.getByText('₱250.00')).toBeInTheDocument()
    const queryError = new Error('Unauthorized: wrong_tenant')
    act(() => {
      mockQueryError = queryError
      for (const listener of mockListeners) listener()
    })
    expect(screen.getByText('Live order data is temporarily unavailable.')).toBeInTheDocument()
    expect(Sentry.captureException).toHaveBeenCalledWith(queryError, expect.anything())
    expect(mockListeners.size).toBe(0)
    mockQueryError = null
    view.rerender(<StrictMode><ConvexDashboardStats {...props} convexUrl="https://recovered.convex.cloud" /></StrictMode>)
    expect(screen.getByText('₱250.00')).toBeInTheDocument()
    expect(errorLog.mock.calls.flat().map(String).join(' ')).not.toMatch(/more hooks|fewer hooks|Could not find Convex client/)
  } finally {
    mockQueryError = null
    errorLog.mockRestore()
  }
})
