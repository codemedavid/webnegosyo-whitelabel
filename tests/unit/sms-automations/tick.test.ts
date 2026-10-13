/**
 * The cron tick only touches stores that have an automatic automation ON and
 * an enrolled sender phone, keeps going when one store fails, and stops
 * starting new stores once its time budget is spent.
 */

import { runAutomationTick, storesDueForTick } from '@/lib/sms-automations/server/tick'
import type { SupabaseClient } from '@supabase/supabase-js'

type Rows = Record<string, { tenant_id: string }[]>

/** Just enough of the PostgREST builder: every filter is recorded, `range` resolves. */
function fakeClient(rows: Rows) {
  const calls: { table: string; filters: unknown[][] }[] = []
  const client = {
    from(table: string) {
      const call = { table, filters: [] as unknown[][] }
      calls.push(call)
      const builder = {
        select: () => builder,
        eq: (...args: unknown[]) => { call.filters.push(['eq', ...args]); return builder },
        in: (...args: unknown[]) => { call.filters.push(['in', ...args]); return builder },
        order: () => builder,
        range: async () => ({ data: rows[table] ?? [], error: null }),
      }
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

describe('storesDueForTick', () => {
  it('keeps only stores with an automatic automation on AND an enabled phone', async () => {
    const { client, calls } = fakeClient({
      sms_automations: [{ tenant_id: 'b' }, { tenant_id: 'a' }, { tenant_id: 'a' }, { tenant_id: 'c' }],
      loyalty_sms_devices: [{ tenant_id: 'a' }, { tenant_id: 'c' }],
    })
    expect(await storesDueForTick(client)).toEqual(['a', 'c'])
    expect(calls[0].filters).toEqual([['eq', 'status', 'on'], ['eq', 'run_mode', 'auto']])
    expect(calls[1].filters).toEqual([['eq', 'enabled', true], ['in', 'tenant_id', ['b', 'a', 'c']]])
  })

  it('reads no phones when nothing is switched on', async () => {
    const { client, calls } = fakeClient({})
    expect(await storesDueForTick(client)).toEqual([])
    expect(calls).toHaveLength(1)
  })
})

describe('runAutomationTick', () => {
  const rows = {
    sms_automations: [{ tenant_id: 'a' }, { tenant_id: 'b' }, { tenant_id: 'c' }],
    loyalty_sms_devices: [{ tenant_id: 'a' }, { tenant_id: 'b' }, { tenant_id: 'c' }],
  }
  const epoch = () => new Date(0) // rotation offset 0

  it('keeps going when one store fails', async () => {
    const { client } = fakeClient(rows)
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const summary = await runAutomationTick({
      client, now: epoch,
      runOne: async (id) => { if (id === 'b') throw new Error('boom'); return 2 },
    })
    expect(summary).toEqual({ stores: 3, processed: 2, queued: 4, failed: 1, deferred: 0 })
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('defers the rest once the budget is spent', async () => {
    const { client } = fakeClient(rows)
    const seen: string[] = []
    const summary = await runAutomationTick({
      client, now: epoch, budgetMs: -1,
      runOne: async (id) => { seen.push(id); return 1 },
    })
    expect(seen).toEqual([])
    expect(summary.deferred).toBe(3)
  })

  it('rotates which store goes first', async () => {
    const { client } = fakeClient(rows)
    const seen: string[] = []
    await runAutomationTick({ client, now: () => new Date(5 * 60_000), runOne: async (id) => { seen.push(id); return 0 } })
    expect(seen).toEqual(['b', 'c', 'a'])
  })
})
