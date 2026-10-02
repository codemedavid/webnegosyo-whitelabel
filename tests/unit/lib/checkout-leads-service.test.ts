import { getCheckoutPayableAmount } from '@/lib/checkout-leads/payment-terms'

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

jest.mock('@/lib/posthog', () => ({
  captureCheckoutLeadCreated: jest.fn().mockResolvedValue(undefined),
}))

// The actions module imports `@/lib/platform-staff/guard`, which imports
// `next/server` — unloadable under jsdom. Stub it as an authorized superadmin.
const SUPERADMIN_CALLER = { user: { id: 'user-1' }, appUser: { role: 'superadmin', platform_permissions: null } }
jest.mock('@/lib/platform-staff/guard', () => ({
  getConsoleCaller: jest.fn(async () => SUPERADMIN_CALLER),
  requirePlatformPermission: jest.fn(async () => SUPERADMIN_CALLER),
  requireFullSuperadmin: jest.fn(async () => SUPERADMIN_CALLER),
  platformPermissionResponse: jest.fn(async () => null),
  PlatformAccessError: class PlatformAccessError extends Error {},
}))

// next/jest does not hoist jest.mock above static imports — load lazily.
let submitCheckoutForm: typeof import('@/app/actions/checkout-leads')['submitCheckoutForm']
let createCheckoutLead: typeof import('@/lib/checkout-leads/checkout-leads-service')['createCheckoutLead']
let captureCheckoutLeadCreated: typeof import('@/lib/posthog')['captureCheckoutLeadCreated']
let createAdminClient: typeof import('@/lib/supabase/admin')['createAdminClient']

beforeAll(async () => {
  ;({ submitCheckoutForm } = await import('@/app/actions/checkout-leads'))
  ;({ createCheckoutLead } = await import('@/lib/checkout-leads/checkout-leads-service'))
  ;({ captureCheckoutLeadCreated } = await import('@/lib/posthog'))
  ;({ createAdminClient } = await import('@/lib/supabase/admin'))
})

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
