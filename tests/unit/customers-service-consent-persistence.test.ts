import { describe, it, expect } from '@jest/globals'
import { createSupabaseCustomerStore } from '@/lib/customers-service'

/**
 * Consent recorded outside the order stream must survive the guest's next order.
 *
 * `computeCustomerAggregate` derives `smsConsent` purely from the orders linked
 * to a customer, starting at false. That is correct for the checkout tick-box
 * and wrong for every other way consent can arrive — notably the merchant app's
 * "They agreed to texts" button, which writes `customers.sms_consent` directly
 * with no order carrying it.
 *
 * Written unconditionally, the recomputed aggregate would overwrite that
 * merchant-recorded consent back to false the next time the guest ordered. The
 * merchant would watch the "Can text" count go up and quietly back down, which
 * is the same "looks captured and is not" failure the boolean-vs-string bug
 * already produced once.
 *
 * Withdrawal stays an explicit act (the opt-out flag, or undoing the opt-in) —
 * it is never a side effect of placing an order.
 */

interface CapturedUpdate {
  table: string
  payload: Record<string, unknown>
}

function makeAdmin(captured: CapturedUpdate[]) {
  return {
    from(table: string) {
      return {
        update(payload: Record<string, unknown>) {
          captured.push({ table, payload })
          return { eq: async () => ({ error: null }) }
        },
      }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

const BASE_PATCH = {
  name: 'Maria Santos',
  phoneE164: '+639170000001',
  email: null,
  orderCount: 4,
  totalSpent: 1200,
  averageOrderValue: 300,
  firstOrderAt: '2026-06-01T02:00:00.000Z',
  lastOrderAt: '2026-08-01T02:00:00.000Z',
  channelsUsed: ['pickup'],
  topItems: [],
  smsConsent: false,
  smsConsentAt: null,
}

describe('saveCustomerProfile — consent is raised, never cleared', () => {
  it('does not write consent at all when this guest has never consented on an order', async () => {
    // The aggregate cannot see consent recorded at the counter, so a `false`
    // here means "no evidence", not "they said no".
    const captured: CapturedUpdate[] = []

    await createSupabaseCustomerStore(makeAdmin(captured)).saveCustomerProfile(
      'c1',
      BASE_PATCH
    )

    const [{ payload }] = captured
    expect(payload).not.toHaveProperty('sms_consent')
    expect(payload).not.toHaveProperty('sms_consent_at')
  })

  it('still writes consent when an order actually carried it', async () => {
    const captured: CapturedUpdate[] = []

    await createSupabaseCustomerStore(makeAdmin(captured)).saveCustomerProfile('c1', {
      ...BASE_PATCH,
      smsConsent: true,
      smsConsentAt: '2026-07-01T02:00:00.000Z',
    })

    const [{ payload }] = captured
    expect(payload.sms_consent).toBe(true)
    expect(payload.sms_consent_at).toBe('2026-07-01T02:00:00.000Z')
  })

  it('keeps writing the rest of the profile either way', async () => {
    // Skipping consent must not turn into skipping the aggregate.
    const captured: CapturedUpdate[] = []

    await createSupabaseCustomerStore(makeAdmin(captured)).saveCustomerProfile(
      'c1',
      BASE_PATCH
    )

    const [{ payload }] = captured
    expect(payload.order_count).toBe(4)
    expect(payload.total_spent).toBe(1200)
    expect(payload.last_order_at).toBe('2026-08-01T02:00:00.000Z')
  })

  it('never touches the opt-out flag from the order path', async () => {
    const captured: CapturedUpdate[] = []

    await createSupabaseCustomerStore(makeAdmin(captured)).saveCustomerProfile('c1', {
      ...BASE_PATCH,
      smsConsent: true,
      smsConsentAt: '2026-07-01T02:00:00.000Z',
    })

    expect(captured[0].payload).not.toHaveProperty('sms_opt_out')
  })
})
