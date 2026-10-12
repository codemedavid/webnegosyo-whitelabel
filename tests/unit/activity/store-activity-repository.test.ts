import {
  StoreActivityError,
  fetchStoreActivity,
  fetchStoreActivitySummary,
  markStoreActivityReviewed,
  type ActivityRpcClient,
} from '@/lib/activity/repository'
import { RAW_FUTURE_ROW, RAW_REFUND_ROW, RAW_STOCK_ROW, RAW_SUMMARY } from '../../fixtures/store-activity-rows'

const TENANT = '0dd96b60-5232-4c79-922b-0bd9022d12ba'

interface Call {
  fn: string
  args: Record<string, unknown>
}

function fakeClient(result: { data: unknown; error: { message: string; code?: string } | null }) {
  const calls: Call[] = []
  const client: ActivityRpcClient = {
    rpc: (fn, args) => {
      calls.push({ fn, args })
      return Promise.resolve(result)
    },
  }
  return { client, calls }
}

describe('fetchStoreActivity', () => {
  it('maps the query onto get_store_activity parameters', async () => {
    const { client, calls } = fakeClient({ data: [], error: null })
    await fetchStoreActivity(client, TENANT, {
      limit: 20,
      categories: ['money', 'cash'],
      flaggedOnly: true,
      includeRoutine: true,
      search: '  #14 ',
      since: '2026-10-01T00:00:00.000Z',
      cursor: { occurredAt: '2026-10-12T04:33:00.000Z', id: RAW_REFUND_ROW.id },
    })
    expect(calls).toEqual([{
      fn: 'get_store_activity',
      args: {
        p_tenant_id: TENANT,
        p_limit: 20,
        p_before_occurred_at: '2026-10-12T04:33:00.000Z',
        p_before_id: RAW_REFUND_ROW.id,
        p_since: '2026-10-01T00:00:00.000Z',
        p_until: null,
        p_categories: ['money', 'cash'],
        p_outlet_id: null,
        p_actor_user_id: null,
        p_flagged_only: true,
        p_include_routine: true,
        p_search: '#14',
        p_subject_type: null,
        p_subject_ref: null,
      },
    }])
  })

  it('hands back a keyset cursor from the last raw row when the page is full', async () => {
    const { client } = fakeClient({ data: [RAW_REFUND_ROW, RAW_STOCK_ROW, RAW_FUTURE_ROW], error: null })
    const page = await fetchStoreActivity(client, TENANT, { limit: 3 })
    expect(page.events.map((e) => e.kind)).toEqual(['refund.issued', 'stock.wasted'])
    // The cursor follows the RAW page so an unknown kind can never stall paging.
    expect(page.nextCursor).toEqual({ occurredAt: '2026-10-12T04:33:00.123Z', id: RAW_FUTURE_ROW.id })
  })

  it('has no cursor on a short page', async () => {
    const { client } = fakeClient({ data: [RAW_REFUND_ROW], error: null })
    expect((await fetchStoreActivity(client, TENANT, { limit: 50 })).nextCursor).toBeNull()
  })

  it('defaults to 50 rows and refuses bad input before calling the server', async () => {
    const { client, calls } = fakeClient({ data: [], error: null })
    await fetchStoreActivity(client, TENANT)
    expect(calls[0].args.p_limit).toBe(50)
    await expect(fetchStoreActivity(client, TENANT, { limit: 500 })).rejects.toThrow(StoreActivityError)
    await expect(fetchStoreActivity(client, 'not-a-uuid')).rejects.toThrow(StoreActivityError)
    await expect(fetchStoreActivity(client, TENANT, { search: 'x'.repeat(81) })).rejects.toThrow(StoreActivityError)
    expect(calls).toHaveLength(1)
  })

  it('turns a refusal into a typed error', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'Not allowed', code: '42501' } })
    await expect(fetchStoreActivity(client, TENANT)).rejects.toMatchObject({ code: 'not_allowed' })
  })
})

describe('fetchStoreActivitySummary', () => {
  it('calls the summary RPC and parses it', async () => {
    const { client, calls } = fakeClient({ data: RAW_SUMMARY, error: null })
    const summary = await fetchStoreActivitySummary(client, TENANT, {
      since: '2026-10-12T00:00:00+08:00',
      until: '2026-10-13T00:00:00+08:00',
    })
    expect(calls[0]).toEqual({
      fn: 'get_store_activity_summary',
      args: { p_tenant_id: TENANT, p_since: '2026-10-12T00:00:00+08:00', p_until: '2026-10-13T00:00:00+08:00', p_outlet_id: null },
    })
    expect(summary.flaggedOpen).toBe(3)
  })

  it('refuses a window over 93 days client-side', async () => {
    const { client, calls } = fakeClient({ data: RAW_SUMMARY, error: null })
    await expect(fetchStoreActivitySummary(client, TENANT, {
      since: '2026-01-01T00:00:00Z', until: '2026-10-01T00:00:00Z',
    })).rejects.toThrow(/93 days/)
    expect(calls).toHaveLength(0)
  })
})

describe('markStoreActivityReviewed', () => {
  it('returns when the row was reviewed', async () => {
    const { client, calls } = fakeClient({ data: '2026-10-12T05:05:00+00:00', error: null })
    await expect(markStoreActivityReviewed(client, RAW_REFUND_ROW.id)).resolves.toBe('2026-10-12T05:05:00.000Z')
    expect(calls[0]).toEqual({ fn: 'mark_store_activity_reviewed', args: { p_id: RAW_REFUND_ROW.id } })
  })
})
