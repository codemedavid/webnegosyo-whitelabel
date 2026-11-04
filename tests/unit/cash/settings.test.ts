/**
 * Cash settings (CONTRACTS §2 `tenant_cash_settings`, §5): defaults when a
 * store has no row, strict validation of what an owner saves, and the
 * read/save calls through the caller's session client.
 */

import {
  CASH_SETTINGS_FORBIDDEN_MESSAGE,
  DEFAULT_CASH_SETTINGS,
  cashSettingsPatchSchema,
  readCashSettings,
  saveCashSettings,
  type CashSettingsDb,
} from '@/lib/cash/settings'
import type { CashRpcClient } from '@/lib/cash/cash-rpc'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'

function tableReturning(reply: { data: unknown; error: { code?: string; message: string } | null }) {
  const seen: Record<string, unknown> = {}
  const db: CashSettingsDb = {
    from: (table) => {
      seen.table = table
      return {
        select: (columns) => {
          seen.columns = columns
          return {
            eq: (column, value) => {
              seen.eq = [column, value]
              return { maybeSingle: () => Promise.resolve(reply) }
            },
          }
        },
      }
    },
  }
  return { db, seen }
}

describe('DEFAULT_CASH_SETTINGS', () => {
  it('are the approved defaults: blind off, counting bills optional, reason above ₱20, remitting optional', () => {
    expect(DEFAULT_CASH_SETTINGS).toEqual({
      blindClose: false,
      requireDenominations: false,
      varianceReasonFromCents: 2000,
      remittanceMode: 'optional',
      requireShiftToSell: false,
      overdueGraceMinutes: 240,
      defaultFloatCents: null,
      updatedAt: null,
      updatedByName: null,
    })
  })
})

describe('cashSettingsPatchSchema', () => {
  it('accepts a partial change', () => {
    expect(cashSettingsPatchSchema.safeParse({ blindClose: true }).success).toBe(true)
  })

  it('refuses unknown keys, like the database does', () => {
    expect(cashSettingsPatchSchema.safeParse({ blindClose: true, tenantId: TENANT_ID }).success).toBe(false)
  })

  it('refuses a reason threshold that is negative, fractional or above ₱1,000', () => {
    expect(cashSettingsPatchSchema.safeParse({ varianceReasonFromCents: -1 }).success).toBe(false)
    expect(cashSettingsPatchSchema.safeParse({ varianceReasonFromCents: 20.5 }).success).toBe(false)
    expect(cashSettingsPatchSchema.safeParse({ varianceReasonFromCents: 100_001 }).success).toBe(false)
    expect(cashSettingsPatchSchema.safeParse({ varianceReasonFromCents: 0 }).success).toBe(true)
  })

  it('accepts only the three remittance modes', () => {
    expect(cashSettingsPatchSchema.safeParse({ remittanceMode: 'required' }).success).toBe(true)
    expect(cashSettingsPatchSchema.safeParse({ remittanceMode: 'always' }).success).toBe(false)
  })

  it('accepts a blank usual float (null) and refuses a negative one', () => {
    expect(cashSettingsPatchSchema.safeParse({ defaultFloatCents: null }).success).toBe(true)
    expect(cashSettingsPatchSchema.safeParse({ defaultFloatCents: -100 }).success).toBe(false)
  })

  it('keeps the overdue grace between 30 minutes and 24 hours, as the app does', () => {
    expect(cashSettingsPatchSchema.safeParse({ overdueGraceMinutes: 1440 }).success).toBe(true)
    expect(cashSettingsPatchSchema.safeParse({ overdueGraceMinutes: 29 }).success).toBe(false)
    expect(cashSettingsPatchSchema.safeParse({ overdueGraceMinutes: 1441 }).success).toBe(false)
  })
})

describe('readCashSettings', () => {
  it('reads the store row through the caller and maps it to camelCase', async () => {
    const { db, seen } = tableReturning({
      data: {
        tenant_id: TENANT_ID,
        blind_close: true,
        require_denominations: true,
        variance_reason_from_cents: 5000,
        remittance_mode: 'required',
        require_shift_to_sell: true,
        overdue_grace_minutes: 120,
        // bigint arrives as a digit string through PostgREST.
        default_float_cents: '200000',
        updated_at: '2026-10-24T01:00:00.000Z',
        updated_by: 'u1',
        updated_by_name: 'Maria',
      },
      error: null,
    })

    const result = await readCashSettings(db, TENANT_ID)

    expect(seen.table).toBe('tenant_cash_settings')
    expect(seen.eq).toEqual(['tenant_id', TENANT_ID])
    expect(result).toEqual({
      ok: true,
      data: {
        blindClose: true,
        requireDenominations: true,
        varianceReasonFromCents: 5000,
        remittanceMode: 'required',
        requireShiftToSell: true,
        overdueGraceMinutes: 120,
        defaultFloatCents: 200000,
        updatedAt: '2026-10-24T01:00:00.000Z',
        updatedByName: 'Maria',
      },
    })
  })

  it('refuses a rule of the wrong kind instead of quietly using the default', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const { db } = tableReturning({ data: { blind_close: 'yes' }, error: null })

    const result = await readCashSettings(db, TENANT_ID)
    errorSpy.mockRestore()

    expect(result.ok).toBe(false)
  })

  it('gives the defaults when the store has no row', async () => {
    const { db } = tableReturning({ data: null, error: null })

    expect(await readCashSettings(db, TENANT_ID)).toEqual({ ok: true, data: DEFAULT_CASH_SETTINGS })
  })

  it('fails (never quietly the defaults) when the read errors', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const { db } = tableReturning({ data: null, error: { code: '42P01', message: 'relation does not exist' } })

    const result = await readCashSettings(db, TENANT_ID)
    errorSpy.mockRestore()

    expect(result.ok).toBe(false)
  })
})

describe('saveCashSettings', () => {
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

  it('sends only the changed keys to save_cash_settings and reads back the saved settings', async () => {
    const saved = { ...DEFAULT_CASH_SETTINGS, blindClose: true, updatedAt: '2026-10-24T01:00:00.000Z', updatedByName: 'Maria' }
    const { client, calls } = rpcReturning({ data: saved, error: null })

    const result = await saveCashSettings(client, TENANT_ID, { blindClose: true })

    expect(calls).toEqual([{ fn: 'save_cash_settings', args: { p_tenant: TENANT_ID, p_settings: { blind_close: true } } }])
    expect(result).toEqual({ ok: true, data: saved })
  })

  it('refuses an invalid change before calling the database', async () => {
    const { client, calls } = rpcReturning({ data: null, error: null })

    const result = await saveCashSettings(client, TENANT_ID, { remittanceMode: 'always' } as never)

    expect(calls).toHaveLength(0)
    expect(result.ok).toBe(false)
  })

  it('says who may change cash rules on 42501', async () => {
    const { client } = rpcReturning({ data: null, error: { code: '42501', message: 'cash_manage' } })

    const result = await saveCashSettings(client, TENANT_ID, { blindClose: true })

    expect(result).toEqual({ ok: false, error: { kind: 'forbidden', message: CASH_SETTINGS_FORBIDDEN_MESSAGE } })
  })
})
