import { render, screen } from '@testing-library/react'
import OrderTrackingPage from '@/app/[tenant]/order/[orderId]/page'
import { getCachedTenantBySlug } from '@/lib/cache'
import { fetchOrderTrackingData } from '@/lib/order-tracking-service'
import { getOrderStampStatus } from '@/lib/loyalty/order-stamp-service'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), notFound: jest.fn() }))
jest.mock('@/lib/cache', () => ({ getCachedTenantBySlug: jest.fn() }))
jest.mock('@/lib/order-tracking-service', () => ({ fetchOrderTrackingData: jest.fn() }))
jest.mock('@/lib/loyalty/order-stamp-service', () => ({ getOrderStampStatus: jest.fn() }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/loyalty/store', () => ({ loadActiveLoyaltyPrograms: async () => [] }))
jest.mock('@/lib/loyalty/offer', () => ({ describeLoyaltyOffer: () => ({
  programName: 'Coffee Club', earnMode: 'stamp', threshold: 8, rewardLabel: 'Free Coffee', minSpend: null,
}) }))

it('renders saved checkout progress on the initial order page without asking for the phone again', async () => {
  global.fetch = jest.fn().mockReturnValue(new Promise(() => {}))
  jest.mocked(getCachedTenantBySlug).mockResolvedValue({
    id: 'tenant-1', name: 'Coffee Shop', slug: 'coffee', loyalty_enabled: true, loyalty_shadow: false,
  } as Awaited<ReturnType<typeof getCachedTenantBySlug>>)
  jest.mocked(fetchOrderTrackingData).mockResolvedValue({ error: null, data: {
    status: 'pending', items: [], total: 100, hasContact: true, createdAt: '2026-09-11T00:00:00Z', isTerminal: false,
  } })
  jest.mocked(getOrderStampStatus).mockResolvedValue({ ok: true, status: {
    claim: { state: 'open' }, hasContact: true,
    card: { programName: 'Coffee Club', earnMode: 'stamp', balance: 3, threshold: 8, rewardsAvailable: 0, rewardLabel: 'Free Coffee', earnedOnOrder: false },
  } })
  const page = await OrderTrackingPage({ params: Promise.resolve({ tenant: 'coffee', orderId: 'order-1' }), searchParams: Promise.resolve({ t: 'token' }) })
  render(page)
  expect(screen.getByTestId('stamp-track')).toHaveAttribute('aria-label', '3 of 8 stamps')
  expect(screen.queryByLabelText(/mobile number/i)).not.toBeInTheDocument()
  expect(screen.getByText('Your reward progress')).toBeInTheDocument()
})
