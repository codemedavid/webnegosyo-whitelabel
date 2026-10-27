/**
 * The business-day close on the web (CONTRACTS W3.1): one parser for the row
 * and the RPC answers, a snapshot whose unknown money stays null, and calls
 * that validate first and turn the database's refusals into sentences.
 */
import type { CashRpcClient } from '@/lib/cash/cash-rpc'
import {
  DAY_CLOSE_COPY,
  closeBusinessDay,
  depositDifferenceCents,
  getDayCloseStatus,
  listDayCloses,
  parseDayClose,
  parseDayCloseSnapshot,
  recordDayDeposit,
  reopenBusinessDay,
} from '@/lib/cash/day-close'
import { fakeSupabaseTables } from '../../fixtures/fake-supabase-tables'
import { SNAPSHOT } from '../../fixtures/day-close-snapshot'

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CLOSE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: CLOSE,
    tenant_id: TENANT,
    outlet_id: null,
    business_day: '2026-10-24',
    version: 1,
    status: 'closed',
    window_start: '2026-10-23T20:00:00.000Z',
    window_end: '2026-10-24T20:00:00.000Z',
    snapshot: SNAPSHOT,
    sales_source: 'platform_sql',
    forced_shift_ids: [],
    unsettled_remittance_ids: null,
    note: null,
    closed_by_name: 'Maria',
    closed_at: '2026-10-24T20:30:00.000Z',
    deposit_cents: null,
    deposit_to: null,
    deposit_ref: null,
    deposit_proof_url: null,
    deposit_recorded_at: null,
    reopened_by_name: null,
    reopened_at: null,
    reopen_reason: null,
    ...overrides,
  }
}

function rpc(reply: { data: unknown; error: { code?: string; message: string } | null }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
  const client: CashRpcClient = {
    rpc: (fn, args) => {
      calls.push({ fn, args })
      return Promise.resolve(reply)
    },
  }
  return { client, calls }
}

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => undefined))
afterEach(() => jest.restoreAllMocks())

describe('parseDayCloseSnapshot', () => {
  it('reads the v1 snapshot plus by named shift and recounts', () => {
    const snapshot = parseDayCloseSnapshot(SNAPSHOT)

    expect(snapshot.sales?.netCents).toBe(4122000)
    expect(snapshot.drawers.shifts[0].countedCents).toBe(834500)
    expect(snapshot.byServicePeriod.map((period) => period.name)).toEqual(['Day shift', 'Night shift'])
    expect(snapshot.otherHoursNetCents).toBe(122000)
    expect(snapshot.recountChanged[0]).toEqual({ shiftId: 's1', staffName: 'Ana', firstCents: 0, finalCents: 834500 })
  })

  it('keeps masked sales and missing money as null, never ₱0', () => {
    const snapshot = parseDayCloseSnapshot({ ...SNAPSHOT, sales: null, cashToAccountForCents: undefined })

    expect(snapshot.sales).toBeNull()
    expect(snapshot.cashToAccountForCents).toBeNull()
  })

  it('reads an empty snapshot (a drawers-only store) without throwing', () => {
    expect(parseDayCloseSnapshot({}).drawers.shifts).toEqual([])
  })
})

describe('parseDayClose', () => {
  it('reads the table row and turns null id lists into empty ones', () => {
    const close = parseDayClose(row())

    expect(close).toMatchObject({ businessDay: '2026-10-24', version: 1, status: 'closed', closedByName: 'Maria', unsettledRemittanceIds: [] })
    expect(close.snapshot.cashToAccountForCents).toBe(1985000)
  })

  it('compares the deposit with the cash to account for once one is recorded', () => {
    expect(depositDifferenceCents(parseDayClose(row()))).toBeNull()
    expect(depositDifferenceCents(parseDayClose(row({ deposit_cents: 1970000 })))).toBe(-15000)
  })
})

describe('getDayCloseStatus', () => {
  it('reads the checklist for one day and branch', async () => {
    const { client, calls } = rpc({
      data: {
        businessDay: '2026-10-24',
        window: { start: 'a', end: 'b' },
        cutoffMinutes: 240,
        openShifts: [{ shiftId: 's2', staffName: 'Ben', drawerName: 'Cashier 2', openedAt: '2026-10-24T08:00:00.000Z', overdue: true }],
        pendingRemittances: [],
        nonCashUnchecked: [],
        existingClose: null,
        preview: SNAPSHOT,
      },
      error: null,
    })

    const result = await getDayCloseStatus(client, { tenantId: TENANT, outletId: null, day: '2026-10-24' })

    expect(calls[0]).toEqual({ fn: 'get_day_close_status', args: { p_tenant: TENANT, p_outlet: null, p_day: '2026-10-24' } })
    expect(result.ok && result.data.openShifts[0].staffName).toBe('Ben')
    expect(result.ok && result.data.preview?.sales?.netCents).toBe(4122000)
  })
})

describe('closeBusinessDay', () => {
  const input = { tenantId: TENANT, outletId: null, day: '2026-10-24', note: null, force: false }

  it('closes and returns the new version', async () => {
    const { client, calls } = rpc({ data: { id: CLOSE, version: 1, snapshot: SNAPSHOT }, error: null })

    expect(await closeBusinessDay(client, input)).toEqual({ ok: true, data: { id: CLOSE, version: 1 } })
    expect(calls[0].args).toEqual({ p_tenant: TENANT, p_outlet: null, p_day: '2026-10-24', p_note: null, p_force: false })
  })

  it('needs a note to close anyway, before calling', async () => {
    const { client, calls } = rpc({ data: null, error: null })

    expect(await closeBusinessDay(client, { ...input, force: true, note: ' ' })).toMatchObject({ ok: false, reason: 'invalid' })
    expect(calls).toHaveLength(0)
  })

  it.each([
    [{ code: '55000', message: 'open_shifts: Ben is still on shift' }, 'open_shifts', DAY_CLOSE_COPY.openShifts],
    [{ code: '55000', message: 'unsettled_remittances: 1 waiting' }, 'unsettled_remittances', DAY_CLOSE_COPY.unsettled],
    [{ code: '23505', message: 'duplicate key' }, 'already_closed', DAY_CLOSE_COPY.alreadyClosed],
    [{ code: '42501', message: 'cash_manage' }, 'forbidden', DAY_CLOSE_COPY.forbidden],
    [{ code: '57014', message: 'canceling statement' }, 'failed', DAY_CLOSE_COPY.failed],
  ])('turns %o into "%s"', async (error, reason, message) => {
    const { client } = rpc({ data: null, error })

    expect(await closeBusinessDay(client, input)).toEqual({ ok: false, reason, message })
  })
})

describe('reopen and deposit', () => {
  it('reopens with a reason only', async () => {
    const { client, calls } = rpc({ data: null, error: null })

    expect((await reopenBusinessDay(client, CLOSE, '')).ok).toBe(false)
    expect((await reopenBusinessDay(client, CLOSE, 'Late GCash refund')).ok).toBe(true)
    expect(calls).toEqual([{ fn: 'reopen_business_day', args: { p_close_id: CLOSE, p_reason: 'Late GCash refund' } }])
  })

  it('records a deposit once, saying so on the second try', async () => {
    const first = rpc({ data: null, error: null })
    const second = rpc({ data: null, error: { code: 'P0002', message: "deposit_already_recorded: this day's deposit is already recorded (or the day was reopened)." } })
    const deposit = { closeId: CLOSE, cents: 1985000, to: 'BDO savings', ref: '  ', proofUrl: null }

    expect((await recordDayDeposit(first.client, deposit)).ok).toBe(true)
    expect(first.calls[0].args).toEqual({ p_close_id: CLOSE, p_cents: 1985000, p_to: 'BDO savings', p_ref: null, p_proof_url: null })
    expect(await recordDayDeposit(second.client, deposit)).toEqual({ ok: false, reason: 'already_closed', message: DAY_CLOSE_COPY.depositTaken })
  })

  it('refuses a deposit with no destination or a bad amount', async () => {
    const { client, calls } = rpc({ data: null, error: null })

    expect((await recordDayDeposit(client, { closeId: CLOSE, cents: 100, to: '', ref: null, proofUrl: null })).ok).toBe(false)
    expect((await recordDayDeposit(client, { closeId: CLOSE, cents: -1, to: 'Safe', ref: null, proofUrl: null })).ok).toBe(false)
    expect(calls).toHaveLength(0)
  })
})

describe('the database’s own refusals (20261027170000)', () => {
  it('shows a range sentence without its machine key, and keeps note/reason refusals in our words', async () => {
    const early = rpc({ data: null, error: { code: '22023', message: 'A business day can be closed once it has started, not before.' } })
    const note = rpc({ data: null, error: { code: '22023', message: 'note_required: say why the day is closed anyway.' } })

    expect(await closeBusinessDay(early.client, { tenantId: TENANT, outletId: null, day: '2026-10-28', note: null, force: false })).toEqual({
      ok: false,
      reason: 'invalid',
      message: 'A business day can be closed once it has started, not before.',
    })
    expect(await closeBusinessDay(note.client, { tenantId: TENANT, outletId: null, day: '2026-10-24', note: 'x', force: true })).toEqual({
      ok: false,
      reason: 'invalid',
      message: DAY_CLOSE_COPY.noteRequired,
    })
  })

  it('says a day was already reopened, and that a missing close is missing', async () => {
    const twice = rpc({ data: null, error: { code: 'P0002', message: 'not_closed: this day close was already reopened.' } })
    const gone = rpc({ data: null, error: { code: 'P0002', message: 'That day close was not found.' } })

    expect(await reopenBusinessDay(twice.client, CLOSE, 'again')).toEqual({ ok: false, reason: 'already_closed', message: DAY_CLOSE_COPY.alreadyReopened })
    expect(await reopenBusinessDay(gone.client, CLOSE, 'again')).toEqual({ ok: false, reason: 'invalid', message: DAY_CLOSE_COPY.notFound })
  })

  it('reads the masked close get_business_day_close returns to a caller without reports', () => {
    const masked = parseDayClose({
      id: CLOSE,
      tenantId: TENANT,
      outletId: null,
      businessDay: '2026-10-24',
      version: 2,
      status: 'closed',
      windowStart: 'a',
      windowEnd: 'b',
      salesSource: 'platform_sql',
      forcedShiftIds: [],
      unsettledRemittanceIds: ['r1'],
      closedBy: 'u1',
      closedByName: 'Maria',
      closedAt: '2026-10-24T20:30:00.000Z',
      snapshot: { ...SNAPSHOT, sales: null, byServicePeriod: null, otherHoursNetCents: null, salesMasked: true },
    })

    expect(masked.snapshot.sales).toBeNull()
    expect(masked.snapshot.byServicePeriod).toEqual([])
    expect(masked.unsettledRemittanceIds).toEqual(['r1'])
  })
})

describe('listDayCloses', () => {
  it('reads closes in the range, newest first, every version', async () => {
    const { client } = fakeSupabaseTables({
      business_day_closes: [
        row({ id: 'v1', version: 1, status: 'reopened', reopened_at: 'x' }),
        row({ id: 'v2', version: 2 }),
        row({ id: 'old', business_day: '2026-09-01' }),
      ],
    })

    const closes = await listDayCloses(client, { tenantId: TENANT, fromDay: '2026-10-01', toDay: '2026-10-31', outletId: null })

    expect(closes.map((close) => close.id)).toEqual(['v2', 'v1'])
  })
})
