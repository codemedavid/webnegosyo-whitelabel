import { render, screen } from '@testing-library/react'
import * as Sentry from '@sentry/nextjs'
import { SafeConvexProvider } from '@/components/shared/safe-convex-provider'
import { AnalyticsProvider } from '@/components/customer/analytics-provider'

let mockClientError: Error | null = null
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }))
jest.mock('convex/react', () => ({
  ConvexReactClient: jest.fn(() => {
    if (mockClientError) throw mockClientError
    return { setAuth: jest.fn() }
  }),
  ConvexProvider: ({ children }: { children: React.ReactNode }) => children,
  useMutation: jest.fn(() => jest.fn()),
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockClientError = null
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

it('keeps the storefront visible when its optional analytics provider cannot initialize', () => {
  mockClientError = new Error('Invalid analytics deployment')
  render(<AnalyticsProvider convexUrl="invalid-analytics-url"><p>Storefront menu</p></AnalyticsProvider>)
  expect(screen.getByText('Storefront menu')).toBeInTheDocument()
  expect(Sentry.captureException).toHaveBeenCalledWith(mockClientError, expect.anything())
})

it('contains client initialization failures inside the feature fallback', () => {
  const error = new Error('Invalid deployment address')
  mockClientError = error
  render(<SafeConvexProvider url="invalid-url" fallback={<p>Dashboard fallback</p>}><p>Live dashboard</p></SafeConvexProvider>)
  expect(screen.getByText('Dashboard fallback')).toBeInTheDocument()
  expect(Sentry.captureException).toHaveBeenCalledWith(error, expect.objectContaining({ tags: { errorBoundary: 'convex' } }))
})
afterEach(() => jest.restoreAllMocks())

it('reports a caught Convex render failure and shows the existing fallback', () => {
  const error = new Error('Could not find public function orders:list')
  function BrokenQuery(): React.ReactNode { throw error }
  render(<SafeConvexProvider url="https://render-test.convex.cloud" fallback={<p>Dashboard fallback</p>}><BrokenQuery /></SafeConvexProvider>)
  expect(screen.getByText('Dashboard fallback')).toBeInTheDocument()
  expect(Sentry.captureException).toHaveBeenCalledWith(error, expect.objectContaining({
    tags: { errorBoundary: 'convex' },
    contexts: expect.objectContaining({ react: { componentStack: expect.any(String) } }),
  }))
})
