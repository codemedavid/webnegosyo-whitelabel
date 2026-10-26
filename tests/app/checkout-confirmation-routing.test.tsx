jest.mock('next/navigation', () => ({
  notFound: jest.fn(),
  redirect: jest.fn(),
}))

const fetchCheckoutLeadByRef = jest.fn()

jest.mock('@/app/actions/checkout-leads', () => ({
  fetchCheckoutLeadByRef: (...args: unknown[]) => fetchCheckoutLeadByRef(...args),
}))

jest.mock('@/app/checkout/confirmation/confirmation-content', () => ({
  ConfirmationContent: ({ lead }: { lead: { reference_number: string } }) => (
    <div>confirmation:{lead.reference_number}</div>
  ),
}))

import ConfirmationPage from '@/app/checkout/confirmation/page'
import LegacyConfirmationPage from '@/app/checkout/confirmation/[ref]/page'
import { notFound, redirect } from 'next/navigation'

describe('checkout confirmation routing', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('loads the confirmation page from the confirm query param', async () => {
    fetchCheckoutLeadByRef.mockResolvedValue({
      data: {
        reference_number: 'WN-20260410-ABCD',
      },
    })

    const page = await ConfirmationPage({
      searchParams: Promise.resolve({ confirm: 'WN-20260410-ABCD' }),
    })

    expect(fetchCheckoutLeadByRef).toHaveBeenCalledWith('WN-20260410-ABCD')
    expect(page).toEqual(expect.objectContaining({}))
  })

  it('loads a new 8-character reference the same way', async () => {
    fetchCheckoutLeadByRef.mockResolvedValue({ data: { reference_number: 'WN-20261026-ABCD2345' } })

    await ConfirmationPage({ searchParams: Promise.resolve({ confirm: 'WN-20261026-ABCD2345' }) })

    expect(fetchCheckoutLeadByRef).toHaveBeenCalledWith('WN-20261026-ABCD2345')
    expect(notFound).not.toHaveBeenCalled()
  })

  it('calls notFound when the lookup returns nothing (unknown or rate limited)', async () => {
    fetchCheckoutLeadByRef.mockResolvedValue({ data: null, error: 'Too many lookups. Please try again later.' })

    await ConfirmationPage({ searchParams: Promise.resolve({ confirm: 'WN-20261026-ABCD2345' }) })

    expect(notFound).toHaveBeenCalled()
  })

  it('calls notFound when the confirm query param is missing', async () => {
    await ConfirmationPage({
      searchParams: Promise.resolve({}),
    })

    expect(notFound).toHaveBeenCalled()
  })

  it('redirects the legacy dynamic route to the query-based confirmation url', async () => {
    await LegacyConfirmationPage({
      params: Promise.resolve({ ref: 'WN-20260410-ABCD' }),
    })

    expect(redirect).toHaveBeenCalledWith('/checkout/confirmation?confirm=WN-20260410-ABCD')
  })
})
