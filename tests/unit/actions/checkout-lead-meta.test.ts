/**
 * The funnel actions' Meta wiring: a browser lead stores its pixel signals
 * with the IP the SERVER saw and sends a server Lead; staff confirming the
 * money sends the Purchase; other status changes send nothing, and a payment
 * screenshot NEVER sends a Purchase (anyone can upload a fake one).
 */
import { describe, test, expect, jest, beforeEach } from '@jest/globals'

const createCheckoutLead = jest.fn(async (...args: unknown[]) => {
  void args
  return { data: { id: 'lead-1', reference_number: 'SM-1', email: 'a@b.co', phone: '09171234567', amount: 5499 }, error: null }
})
const updateCheckoutLeadStatus = jest.fn(async (...args: unknown[]): Promise<{ error: string | null }> => { void args; return { error: null } })
const applyLeadStatusWithLaunch = jest.fn(async (...args: unknown[]) => { void args; return { handled: false, isPublished: false } })
const sendLeadConversion = jest.fn(async (...args: unknown[]) => { void args; return { sent: true } })
const sendLeadPurchaseOnce = jest.fn(async (...args: unknown[]) => { void args; return { sent: true } })
const sendMetaConversionEvent = jest.fn(async (...args: unknown[]) => { void args; return { sent: true } })
const uploadPaymentProof = jest.fn(async (...args: unknown[]): Promise<{ error: string | null }> => { void args; return { error: null } })

jest.mock('@/lib/action-rate-limit', () => ({
  checkActionRateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
  getActionClientIp: async () => '203.0.113.9',
}))
jest.mock('@/lib/checkout-leads/checkout-leads-service', () => ({
  createCheckoutLead: (...args: unknown[]) => createCheckoutLead(...args),
  updateCheckoutLeadStatus: (...args: unknown[]) => updateCheckoutLeadStatus(...args),
  uploadPaymentProof: (...args: unknown[]) => uploadPaymentProof(...args),
}))
jest.mock('@/lib/imagekit-utils', () => ({ getImageKitEndpoint: () => 'https://ik.imagekit.io/webnegosyo' }))
jest.mock('@/lib/checkout-leads/meta-events', () => {
  const actual = jest.requireActual('@/lib/checkout-leads/meta-events') as Record<string, unknown>
  return {
    ...actual,
    runAfterResponse: async (task: () => Promise<unknown>) => { await task() },
    sendLeadConversion: (...args: unknown[]) => sendLeadConversion(...args),
    sendLeadPurchaseOnce: (...args: unknown[]) => sendLeadPurchaseOnce(...args),
  }
})
jest.mock('@/lib/meta-conversions', () => ({
  sendMetaConversionEvent: (...args: unknown[]) => sendMetaConversionEvent(...args),
}))
jest.mock('@/lib/checkout-leads/platform-payment-methods-service', () => ({}))
jest.mock('@/lib/platform-staff/guard', () => ({ requirePlatformPermission: async () => {} }))
jest.mock('@/lib/posthog', () => ({ captureCheckoutLeadCreated: async () => {} }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ admin: true }) }))
jest.mock('@/lib/onboarding/start', () => ({ issueOnboardingLink: async () => 'unused' }))
jest.mock('@/lib/onboarding/staff', () => ({
  applyLeadStatusWithLaunch: (...args: unknown[]) => applyLeadStatusWithLaunch(...args),
}))
jest.mock('@/lib/onboarding/repository', () => ({}))

const form = {
  name: 'Ana',
  email: 'a@b.co',
  phone: '09171234567',
  business_name: 'Ana Cafe',
  selected_payment_method_id: 'pm-1',
  payment_term: 'six_month_full',
}

const actions = () => import('@/app/actions/checkout-leads')

describe('funnel Meta wiring', () => {
  beforeEach(() => {
    for (const mock of [createCheckoutLead, updateCheckoutLeadStatus, applyLeadStatusWithLaunch, sendLeadConversion, sendLeadPurchaseOnce, sendMetaConversionEvent, uploadPaymentProof]) {
      mock.mockClear()
    }
  })

  test('a browser lead stores its signals with the server-seen IP and sends the server Lead', async () => {
    const { submitCheckoutForm } = await actions()
    const meta = { eventId: 'lead_1', fbp: 'fb.1.1.2', eventSourceUrl: 'https://www.webnegosyo.com/', clientUserAgent: 'UA', clientIpAddress: '6.6.6.6' }
    await (submitCheckoutForm as (value: unknown) => Promise<unknown>)({ ...form, meta })

    const options = createCheckoutLead.mock.calls[0][1] as { metaAttribution: Record<string, unknown> }
    expect(options.metaAttribution).toMatchObject({ leadEventId: 'lead_1', fbp: 'fb.1.1.2', clientIpAddress: '203.0.113.9' })
    expect(sendLeadConversion).toHaveBeenCalledTimes(1)
    expect(sendLeadConversion.mock.calls[0][1]).toBe(options.metaAttribution)
  })

  test('a lead without pixel signals stores none and sends nothing to Meta', async () => {
    const { submitCheckoutForm } = await actions()
    await (submitCheckoutForm as (value: unknown) => Promise<unknown>)(form)
    expect(createCheckoutLead.mock.calls[0][1]).toEqual({ metaAttribution: null })
    expect(sendLeadConversion).not.toHaveBeenCalled()
  })

  test.each(['paid', 'setup_in_progress', 'live'])('marking a lead %s reports the Purchase', async (status) => {
    const { changeCheckoutLeadStatus } = await actions()
    await changeCheckoutLeadStatus('lead-1', status as never)
    expect(sendLeadPurchaseOnce).toHaveBeenCalledWith({ admin: true }, 'lead-1')
  })

  test('a launch-aware "paid" reports the Purchase too', async () => {
    applyLeadStatusWithLaunch.mockResolvedValueOnce({ handled: true, isPublished: true })
    const { changeCheckoutLeadStatus } = await actions()
    await changeCheckoutLeadStatus('lead-1', 'paid')
    expect(sendLeadPurchaseOnce).toHaveBeenCalledTimes(1)
  })

  test.each(['initiated', 'cancelled'])('"%s" sends no Purchase', async (status) => {
    const { changeCheckoutLeadStatus } = await actions()
    await changeCheckoutLeadStatus('lead-1', status as never)
    expect(sendLeadPurchaseOnce).not.toHaveBeenCalled()
  })

  test('a failed status change sends no Purchase', async () => {
    updateCheckoutLeadStatus.mockResolvedValueOnce({ error: 'nope' })
    const { changeCheckoutLeadStatus } = await actions()
    await changeCheckoutLeadStatus('lead-1', 'paid')
    expect(sendLeadPurchaseOnce).not.toHaveBeenCalled()
  })

  test('a saved payment screenshot sends NO Purchase: a fake screenshot once counted as one in Ads Manager', async () => {
    const { submitPaymentProof } = await actions()
    const ref = 'WN-20261026-ABCD2345'
    expect(await submitPaymentProof(ref, 'https://ik.imagekit.io/webnegosyo/checkout-proofs/p.png')).toEqual({ error: null })
    expect(uploadPaymentProof).toHaveBeenCalledTimes(1)
    expect(sendLeadPurchaseOnce).not.toHaveBeenCalled()
    expect(sendMetaConversionEvent).not.toHaveBeenCalled()
  })

  test('a refused screenshot sends no Purchase', async () => {
    uploadPaymentProof.mockResolvedValueOnce({ error: 'This order is no longer waiting for a payment proof.' })
    const { submitPaymentProof } = await actions()
    await submitPaymentProof('WN-20261026-ABCD2345', 'https://ik.imagekit.io/webnegosyo/checkout-proofs/p.png')
    expect(sendMetaConversionEvent).not.toHaveBeenCalled()
  })
})
