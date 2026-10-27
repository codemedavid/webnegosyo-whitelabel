import type { CashRpcClient } from '@/lib/cash/cash-rpc'
import {
  CUTOFF_CHOICES,
  CUTOFF_FORBIDDEN_MESSAGE,
  CUTOFF_QUICK_CHOICES,
  CUTOFF_RANGE_MESSAGE,
  setBusinessDayCutoff,
} from '@/lib/cash/cutoff'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'

function rpcReturning(reply: { data: unknown; error: { code?: string; message: string } | null }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
  const client: CashRpcClient = {
    rpc: (fn, args) => {
      calls.push({ fn, args })
      return Promise.resolve(reply)
    },
  }
  return { client, calls }
}

describe('cutoff choices', () => {
  it('offer midnight to 11:45 AM in 15-minute steps, with midnight–6 AM as chips', () => {
    expect(CUTOFF_CHOICES[0]).toBe(0)
    expect(CUTOFF_CHOICES[CUTOFF_CHOICES.length - 1]).toBe(705)
    expect(CUTOFF_CHOICES).toHaveLength(48)
    expect(CUTOFF_QUICK_CHOICES.every((minutes) => CUTOFF_CHOICES.includes(minutes))).toBe(true)
  })
})

describe('setBusinessDayCutoff', () => {
  it('calls set_business_day_cutoff and returns the first day it applies to', async () => {
    const { client, calls } = rpcReturning({ data: '2026-10-25', error: null })

    const result = await setBusinessDayCutoff(client, TENANT_ID, 240)

    expect(calls).toEqual([{ fn: 'set_business_day_cutoff', args: { p_tenant: TENANT_ID, p_cutoff_minutes: 240 } }])
    expect(result).toEqual({ ok: true, data: '2026-10-25' })
  })

  it('refuses a time outside midnight–11:45 AM or off the 15-minute grid without calling', async () => {
    const { client, calls } = rpcReturning({ data: '2026-10-25', error: null })

    expect(await setBusinessDayCutoff(client, TENANT_ID, 720)).toEqual({ ok: false, error: { kind: 'invalid', message: CUTOFF_RANGE_MESSAGE } })
    expect((await setBusinessDayCutoff(client, TENANT_ID, 250)).ok).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('says who may change it on 42501', async () => {
    const { client } = rpcReturning({ data: null, error: { code: '42501', message: 'settings' } })

    expect(await setBusinessDayCutoff(client, TENANT_ID, 240)).toEqual({ ok: false, error: { kind: 'forbidden', message: CUTOFF_FORBIDDEN_MESSAGE } })
  })
})
