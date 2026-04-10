import { submitCheckoutForm } from '@/app/actions/checkout-leads'
import { getCheckoutPayableAmount } from '@/lib/checkout-leads/payment-terms'
import { createCheckoutLead } from '@/lib/checkout-leads/checkout-leads-service'
import { captureCheckoutLeadCreated } from '@/lib/posthog'
import { createAdminClient } from '@/lib/supabase/admin'

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

jest.mock('@/lib/posthog', () => ({
  captureCheckoutLeadCreated: jest.fn().mockResolvedValue(undefined),
}))

describe('createCheckoutLead', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('stores payment_term and server-computed downpayment amount', async () => {
    const insert = jest.fn().mockReturnThis()
    const select = jest.fn().mockReturnThis()
    const single = jest.fn().mockResolvedValue({
      data: {
        reference_number: 'WN-20260410-ABCD',
        amount: getCheckoutPayableAmount('downpayment_50'),
        payment_term: 'downpayment_50',
      },
      error: null,
    })

    ;(createAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({ insert, select, single }),
    })

    await createCheckoutLead({
      name: 'Juan Dela Cruz',
      email: 'juan@example.com',
      phone: '09171234567',
      business_name: 'Juan Kitchen',
      selected_payment_method_id: 'payment-method-1',
      payment_term: 'downpayment_50',
    })

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_term: 'downpayment_50',
        amount: getCheckoutPayableAmount('downpayment_50'),
      })
    )
  })

  it('uses shared payment-term pricing for analytics when stored amount is missing', async () => {
    const insert = jest.fn().mockReturnThis()
    const select = jest.fn().mockReturnThis()
    const single = jest.fn().mockResolvedValue({
      data: {
        reference_number: 'WN-20260410-EFGH',
        amount: null,
        payment_term: 'downpayment_50',
      },
      error: null,
    })

    ;(createAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({ insert, select, single }),
    })

    await submitCheckoutForm({
      name: 'Juan Dela Cruz',
      email: 'juan@example.com',
      phone: '09171234567',
      business_name: 'Juan Kitchen',
      selected_payment_method_id: 'payment-method-1',
      payment_term: 'downpayment_50',
    })

    expect(captureCheckoutLeadCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceNumber: 'WN-20260410-EFGH',
        amount: getCheckoutPayableAmount('downpayment_50'),
      })
    )
  })
})
