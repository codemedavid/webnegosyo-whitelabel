/**
 * The store's cash rules (CONTRACTS §2 `tenant_cash_settings`, §5): one row
 * per store, NO ROW = the defaults below. Same rules and copy as the app's
 * Shift & remit rules screen (`webnegosyo-app/lib/cash/settings.ts`).
 *
 * Reads go through the caller's session client (members of the store may
 * read); writes only through `save_cash_settings` (definer, `cash_manage`,
 * unknown keys refused), which returns the saved settings as camelCase JSON.
 * A failed read is a failure, never the defaults: the page would otherwise
 * show "Blind count: Off" for a store that turned it on.
 */

import { z } from 'zod'
import { callCashRpc, cashFailure, CASH_FAILED_MESSAGE, type CashDbError, type CashResult, type CashRpcClient } from './cash-rpc'

export const REMITTANCE_MODES = ['off', 'optional', 'required'] as const
export type RemittanceMode = (typeof REMITTANCE_MODES)[number]

/** ₱1,000: a reason threshold above this would never ask anyone for a reason. */
export const MAX_REASON_THRESHOLD_CENTS = 100_000
/** ₱1,000,000: a usual float only a typo reaches (same ceiling as the app). */
export const MAX_DEFAULT_FLOAT_CENTS = 100_000_000
/** Between 30 minutes and 24 hours after the business day ends (same range as the app). */
export const MIN_OVERDUE_GRACE_MINUTES = 30
export const MAX_OVERDUE_GRACE_MINUTES = 1440
/** The reason threshold moves ₱10 per step, as on the app's stepper. */
export const REASON_THRESHOLD_STEP_CENTS = 1000

export interface CashSettings {
  /** Hide expected cash from cashiers until they have counted. */
  blindClose: boolean
  /** Counting bills and coins at the end of a shift is required (else optional). */
  requireDenominations: boolean
  /** Ask for a reason when |counted − expected| is MORE than this. */
  varianceReasonFromCents: number
  remittanceMode: RemittanceMode
  /** The first Charge without a shift opens Start shift. */
  requireShiftToSell: boolean
  /** How long after the business day ends an open shift counts as overdue. */
  overdueGraceMinutes: number
  /** Usual starting float; null = each drawer's own. */
  defaultFloatCents: number | null
  updatedAt: string | null
  updatedByName: string | null
}

export const DEFAULT_CASH_SETTINGS: CashSettings = {
  blindClose: false,
  requireDenominations: false,
  varianceReasonFromCents: 2000,
  remittanceMode: 'optional',
  requireShiftToSell: false,
  overdueGraceMinutes: 240,
  defaultFloatCents: null,
  updatedAt: null,
  updatedByName: null,
}

const wholeCents = z.number().int()

/** What an owner may change. Strict: an unknown key is refused here as it is in SQL. */
export const cashSettingsPatchSchema = z
  .object({
    blindClose: z.boolean(),
    requireDenominations: z.boolean(),
    varianceReasonFromCents: wholeCents.min(0).max(MAX_REASON_THRESHOLD_CENTS),
    remittanceMode: z.enum(REMITTANCE_MODES),
    requireShiftToSell: z.boolean(),
    overdueGraceMinutes: z.number().int().min(MIN_OVERDUE_GRACE_MINUTES).max(MAX_OVERDUE_GRACE_MINUTES),
    defaultFloatCents: wholeCents.min(0).max(MAX_DEFAULT_FLOAT_CENTS).nullable(),
  })
  .partial()
  .strict()

export type CashSettingsPatch = z.infer<typeof cashSettingsPatchSchema>

/** Each setting's table column: the RPC takes columns (like the app's twin) and may answer in either case. */
const COLUMNS = {
  blindClose: 'blind_close',
  requireDenominations: 'require_denominations',
  varianceReasonFromCents: 'variance_reason_from_cents',
  remittanceMode: 'remittance_mode',
  requireShiftToSell: 'require_shift_to_sell',
  overdueGraceMinutes: 'overdue_grace_minutes',
  defaultFloatCents: 'default_float_cents',
  updatedAt: 'updated_at',
  updatedByName: 'updated_by_name',
} as const satisfies Record<keyof CashSettings, string>

/** `bigint` columns may arrive as digit strings. */
const centsValue = z.union([wholeCents, z.string().regex(/^\d+$/).transform(Number)])

/** Missing = the default; a value of the wrong kind THROWS (a rule we can't read is never quietly the default). */
const savedSettingsSchema = z.object({
  blindClose: z.boolean().default(DEFAULT_CASH_SETTINGS.blindClose),
  requireDenominations: z.boolean().default(DEFAULT_CASH_SETTINGS.requireDenominations),
  varianceReasonFromCents: centsValue.pipe(wholeCents.min(0)).default(DEFAULT_CASH_SETTINGS.varianceReasonFromCents),
  remittanceMode: z.enum(REMITTANCE_MODES).default(DEFAULT_CASH_SETTINGS.remittanceMode),
  requireShiftToSell: z.boolean().default(DEFAULT_CASH_SETTINGS.requireShiftToSell),
  overdueGraceMinutes: z.number().int().min(0).default(DEFAULT_CASH_SETTINGS.overdueGraceMinutes),
  defaultFloatCents: centsValue.pipe(wholeCents.min(0)).nullable().default(null),
  updatedAt: z.string().nullable().default(null),
  updatedByName: z.string().nullable().default(null),
})

/** A table row (snake_case) or the RPC's answer (camelCase) → settings. */
export function parseSavedCashSettings(data: unknown): CashSettings {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new Error('Cash settings must be an object.')
  const source = data as Record<string, unknown>
  const picked = Object.fromEntries(
    (Object.keys(COLUMNS) as Array<keyof CashSettings>).map((key) => {
      const column = COLUMNS[key]
      const value = column in source ? source[column] : source[key]
      return [key, value === undefined ? undefined : value]
    }),
  )
  return savedSettingsSchema.parse(picked)
}

/** A validated change → the column names `save_cash_settings` takes. */
export function toSettingsColumns(patch: CashSettingsPatch): Record<string, unknown> {
  return Object.fromEntries(Object.entries(patch).map(([key, value]) => [COLUMNS[key as keyof CashSettingsPatch], value]))
}

/** The slice of a Supabase client the read uses (the table is not in the generated types yet). */
export interface CashSettingsDb {
  from: (table: 'tenant_cash_settings') => {
    select: (columns: string) => {
      eq: (column: 'tenant_id', value: string) => {
        maybeSingle: () => PromiseLike<{ data: unknown; error: CashDbError | null }>
      }
    }
  }
}

export function asCashSettingsDb(client: unknown): CashSettingsDb {
  return client as CashSettingsDb
}

const SETTINGS_COLUMNS =
  'blind_close, require_denominations, variance_reason_from_cents, remittance_mode, require_shift_to_sell, overdue_grace_minutes, default_float_cents, updated_at, updated_by_name'

export const CASH_SETTINGS_FORBIDDEN_MESSAGE = 'Only the owner or someone who handles cash can change these rules.'
export const CASH_SETTINGS_LOAD_FAILED_MESSAGE = 'Your cash rules couldn’t load. Reload the page to try again.'

export async function readCashSettings(db: CashSettingsDb, tenantId: string): Promise<CashResult<CashSettings>> {
  try {
    const { data, error } = await db.from('tenant_cash_settings').select(SETTINGS_COLUMNS).eq('tenant_id', tenantId).maybeSingle()
    if (error) {
      console.error('[cash] tenant_cash_settings read failed', `${error.code ?? 'no code'}: ${error.message}`)
      return cashFailure('failed', CASH_SETTINGS_LOAD_FAILED_MESSAGE)
    }
    if (data === null || data === undefined) return { ok: true, data: DEFAULT_CASH_SETTINGS }
    return { ok: true, data: parseSavedCashSettings(data) }
  } catch (error) {
    console.error('[cash] tenant_cash_settings read failed', error instanceof Error ? error.message : error)
    return cashFailure('failed', CASH_SETTINGS_LOAD_FAILED_MESSAGE)
  }
}

/** Save a change (only the keys given). Returns the settings as saved. */
export function saveCashSettings(client: CashRpcClient, tenantId: string, patch: CashSettingsPatch): Promise<CashResult<CashSettings>> {
  const parsed = cashSettingsPatchSchema.safeParse(patch)
  if (!parsed.success) return Promise.resolve(cashFailure('invalid', 'One of these rules isn’t a value we can save. Check it and try again.'))
  return callCashRpc(client, 'save_cash_settings', { p_tenant: tenantId, p_settings: toSettingsColumns(parsed.data) }, parseSavedCashSettings, {
    forbiddenMessage: CASH_SETTINGS_FORBIDDEN_MESSAGE,
    failedMessage: CASH_FAILED_MESSAGE,
    invalidMessage: 'One of these rules isn’t a value we can save. Check it and try again.',
  })
}
