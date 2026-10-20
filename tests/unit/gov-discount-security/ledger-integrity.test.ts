/**
 * Sales-book integrity: reversals must match the real order, late and
 * out-of-order records must not double count, timestamps are bounded, and an
 * approval only vouches for the sale it was given for.
 */
import { describe, it, expect } from '@jest/globals'
import {
  computeGovDiscount,
  defaultTaxProfile,
  type RecordGovDiscountRequest,
  type StoredGovDiscount,
} from '@/lib/gov-discount'
import {
  ledgerTimestamp,
  recordGovDiscount,
  type ActiveGrant,
  type ClaimRow,
  type LedgerOrderState,
  type LedgerStore,
} from '@/lib/gov-discount-ledger/record-service'
import { saleFingerprint, approvalFingerprint } from '@/lib/gov-discount-ledger/approval-binding'
import { reverseGovGrants, reverseIfCancelled } from '@/lib/gov-discount-ledger/reverse-on-cancel'
import { approveGrant, type ApprovalStore } from '@/lib/gov-discount-ledger/approval-service'
import { parseRecordRequest, parseIdPhotoUploadRequest } from '@/lib/gov-discount-ledger/request-schemas'

const TENANT = '11111111-1111-4111-8111-111111111111'
const ORDER = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-10-12T04:05:00.000Z')
const ACTOR = { userId: 'cashier-1', name: 'Ana' }

function government(reduction?: number): StoredGovDiscount {
  const priced = computeGovDiscount({
    vatStatus: 'vat',
    lines: [{ key: 'k1', name: 'Sisig', quantity: 1, amount: 560, eligible: true }],
    claimants: [
      { id: 'c1', kind: 'senior', name: 'Juan Dela Cruz', idNumber: '12345', allocation: { mode: 'items', units: { k1: 1 } } },
    ],
  })
  if (!priced.ok) throw new Error('fixture must price')
  const claimants = reduction === undefined ? priced.claimants : priced.claimants.map((c) => ({ ...c, reduction }))
  return { version: 1, vatStatus: 'vat', serviceChargeMode: 'full', diners: null, claimants, vat: null }
}

function request(overrides: Partial<RecordGovDiscountRequest> = {}): RecordGovDiscountRequest {
  return {
    tenantId: TENANT,
    backend: 'platform_supabase',
    externalOrderId: ORDER,
    orderLabel: '#12',
    outletId: null,
    revision: 0,
    occurredAt: '2026-10-12T04:00:00.000Z',
    orderTotal: 400,
    source: 'pos',
    lines: [{ key: 'k1', menuItemId: 'm1', name: 'Sisig', quantity: 1, amount: 560 }],
    serviceCharge: 0,
    deliveryFee: 0,
    allowShared: true,
    government: government(),
    approvalId: null,
    approvalSkippedOffline: false,
    ...overrides,
  }
}

function memoryStore(options: { orderState?: LedgerOrderState; saved?: null } = {}) {
  const rows: ClaimRow[] = []
  const consumed: unknown[] = []
  const key = (row: ClaimRow) => [row.backend, row.external_order_id, row.revision, row.claimant_ref, row.event].join('|')
  const store: LedgerStore = {
    loadTaxProfile: async () => defaultTaxProfile('vat'),
    loadExcludedMenuItemIds: async () => new Set(),
    loadSavedLines: async () => (options.saved === null ? null : [{ menuItemId: 'm1', quantity: 1, amount: 560 }]),
    loadOrderState: async () => options.orderState ?? { readable: true, exists: true, cancelled: false, hasGovernment: true },
    consumeApproval: async (args) => {
      consumed.push(args)
      return null
    },
    idsUsedElsewhere: async () => new Set(),
    listActiveGrants: async (): Promise<ActiveGrant[]> => {
      const reversed = new Set(rows.filter((r) => r.event === 'reversed').map((r) => `${r.revision}|${r.claimant_ref}`))
      return rows
        .filter((r) => r.event === 'granted' && !reversed.has(`${r.revision}|${r.claimant_ref}`))
        .map((row) => ({ revision: row.revision, claimantRef: row.claimant_ref, row }))
    },
    highestRevision: async () => (rows.length === 0 ? null : Math.max(...rows.map((r) => r.revision))),
    insertClaims: async (incoming) => {
      const fresh = incoming.filter((row) => !rows.some((existing) => key(existing) === key(row)))
      rows.push(...fresh)
      return fresh.length
    },
  }
  return { store, rows, consumed }
}

const standing = (rows: readonly ClaimRow[]) => {
  const reversed = new Set(rows.filter((r) => r.event === 'reversed').map((r) => `${r.revision}|${r.claimant_ref}`))
  return rows.filter((r) => r.event === 'granted' && !reversed.has(`${r.revision}|${r.claimant_ref}`))
}

describe('ledgerTimestamp', () => {
  it('keeps a recent sale time as reported', () => {
    expect(ledgerTimestamp('2026-10-12T04:00:00.000Z', NOW)).toEqual({ occurredAt: '2026-10-12T04:00:00.000Z', flags: [] })
  })

  it('replaces a future time with the server clock, and says so', () => {
    expect(ledgerTimestamp('2026-10-12T05:00:00.000Z', NOW)).toEqual({ occurredAt: NOW.toISOString(), flags: ['clock_ahead'] })
  })

  it('keeps an offline sale time but marks it as sent late', () => {
    expect(ledgerTimestamp('2026-10-10T04:00:00.000Z', NOW)).toEqual({ occurredAt: '2026-10-10T04:00:00.000Z', flags: ['late_sync'] })
  })
})

describe('taking a discount back (government: null)', () => {
  it('reverses when the platform order no longer carries the discount', async () => {
    const { store, rows } = memoryStore()
    await recordGovDiscount(store, request(), ACTOR, NOW)
    const removedStore = memoryStore({ orderState: { readable: true, exists: true, cancelled: false, hasGovernment: false } })
    removedStore.rows.push(...rows)

    const outcome = await recordGovDiscount(removedStore.store, request({ revision: 1, government: null }), ACTOR, NOW)

    expect(outcome).toMatchObject({ reversed: 1 })
    expect(outcome.refused).toBeUndefined()
  })

  it('refuses a take-back while the saved order still carries the discount', async () => {
    const { store, rows } = memoryStore()
    await recordGovDiscount(store, request(), ACTOR, NOW)

    const outcome = await recordGovDiscount(store, request({ revision: 1, government: null }), ACTOR, NOW)

    expect(outcome.refused).toBe('order_still_discounted')
    expect(standing(rows)).toHaveLength(1)
  })

  it('refuses a take-back for an order that does not exist in this store', async () => {
    const { store, rows } = memoryStore({ orderState: { readable: true, exists: false } })
    await recordGovDiscount(store, request(), ACTOR, NOW)

    const outcome = await recordGovDiscount(store, request({ revision: 1, government: null }), ACTOR, NOW)

    expect(outcome.refused).toBe('order_not_found')
    expect(standing(rows)).toHaveLength(1)
  })

  it('reverses an order the server cannot read, flagged for the owner', async () => {
    const { store, rows } = memoryStore({ orderState: { readable: false }, saved: null })
    await recordGovDiscount(store, request({ backend: 'convex', externalOrderId: 'jd7abc' }), ACTOR, NOW)

    await recordGovDiscount(store, request({ backend: 'convex', externalOrderId: 'jd7abc', revision: 1, government: null }), ACTOR, NOW)

    const reversal = rows.find((row) => row.event === 'reversed')
    expect(reversal?.flags).toEqual(['reversal_unverified'])
  })

  it('never reverses a NEWER revision when an old take-back arrives late', async () => {
    const free = { readable: true, exists: true, cancelled: false, hasGovernment: false } as const
    const { store, rows } = memoryStore({ orderState: free })
    await recordGovDiscount(store, request({ revision: 2 }), ACTOR, NOW)

    await recordGovDiscount(store, request({ revision: 1, government: null }), ACTOR, NOW)

    expect(standing(rows).map((row) => row.revision)).toEqual([2])
  })
})

describe('records that arrive out of order', () => {
  it('records a late older revision and takes it back at once, so nothing double counts', async () => {
    const { store, rows } = memoryStore()
    await recordGovDiscount(store, request({ revision: 1 }), ACTOR, NOW)

    const late = await recordGovDiscount(store, request({ revision: 0 }), ACTOR, NOW)

    expect(late).toMatchObject({ granted: 1, reversed: 1 })
    expect(standing(rows).map((row) => row.revision)).toEqual([1])
    expect(rows.find((row) => row.revision === 0 && row.event === 'granted')?.flags).toContain('superseded_late')
  })

  it('records a grant that arrives after the order was cancelled, then takes it back', async () => {
    const cancelled = { readable: true, exists: true, cancelled: true, hasGovernment: true } as const
    const { store, rows } = memoryStore({ orderState: cancelled })

    await recordGovDiscount(store, request(), ACTOR, NOW)

    expect(standing(rows)).toHaveLength(0)
    expect(rows.find((row) => row.event === 'granted')?.flags).toContain('recorded_after_cancel')
  })
})

describe('flags on what the server could not check', () => {
  it('flags a grant on an order outside the platform as not checked', async () => {
    const { store } = memoryStore({ orderState: { readable: false }, saved: null })

    const outcome = await recordGovDiscount(store, request({ backend: 'convex', externalOrderId: 'jd7abc' }), ACTOR, NOW)

    expect(outcome.verification).toBe('payload_only')
    expect(outcome.flags).toContain('unverified_order')
  })

  it('records a future-dated sale at the server time', async () => {
    const { store, rows } = memoryStore()

    await recordGovDiscount(store, request({ occurredAt: '2026-11-01T00:00:00.000Z' }), ACTOR, NOW)

    expect(rows[0].occurred_at).toBe(NOW.toISOString())
    expect(rows[0].flags).toContain('clock_ahead')
  })
})

describe('approval binding', () => {
  it('consumes an approval only for the claimants it was given for', async () => {
    const { store, consumed } = memoryStore()

    await recordGovDiscount(store, request({ approvalId: '33333333-3333-4333-8333-333333333333' }), ACTOR, NOW)

    const expected = saleFingerprint(government().claimants, ACTOR.userId)
    expect(consumed).toEqual([expect.objectContaining({ saleFingerprint: expected })])
  })

  it('gives the register and the server the same fingerprint for one sale', () => {
    const fromRegister = approvalFingerprint([{ kind: 'senior', name: 'Juan  dela cruz', idMasked: '••••2345' }], 'cashier-1')
    expect(fromRegister).toBe(saleFingerprint(government().claimants, 'cashier-1'))
  })

  it('stores the fingerprint of the claimants and cashier it approved', async () => {
    const created: { saleFingerprint: string }[] = []
    const store: ApprovalStore = {
      findAccount: async () => ({ userId: 'u-owner', name: 'Owner', role: 'admin', isOwner: true, permissions: [], outletId: null }),
      listAccounts: async () => [],
      usersWithPins: async () => new Set(),
      verifyPin: async () => 'ok',
      setPin: async () => undefined,
      createApproval: async (row) => {
        created.push(row)
        return { id: 'a1', expiresAt: NOW.toISOString() }
      },
    }
    const claimants = [{ kind: 'senior' as const, name: 'Juan Dela Cruz', idMasked: '••••2345' }]

    await approveGrant(store, { tenantId: TENANT, approverUserId: 'u-owner', pin: '8642', reduction: 160, outletId: null, claimants }, { userId: 'cashier-1', name: 'Ana' })

    expect(created[0].saleFingerprint).toBe(saleFingerprint(government().claimants, 'cashier-1'))
  })

  it('differs for another senior, or another cashier', () => {
    const base = approvalFingerprint([{ kind: 'senior', name: 'Juan Dela Cruz', idMasked: '••••2345' }], 'cashier-1')
    expect(approvalFingerprint([{ kind: 'senior', name: 'Maria Santos', idMasked: '••••2345' }], 'cashier-1')).not.toBe(base)
    expect(approvalFingerprint([{ kind: 'senior', name: 'Juan Dela Cruz', idMasked: '••••2345' }], 'cashier-2')).not.toBe(base)
  })
})

describe('reverseGovGrants on cancel', () => {
  it('can be signed by the system when nobody is logged in', async () => {
    const { store, rows } = memoryStore()
    await recordGovDiscount(store, request(), ACTOR, NOW)

    await reverseGovGrants(store, { tenantId: TENANT, backend: 'platform_supabase', externalOrderId: ORDER }, { userId: null, name: 'System' }, NOW.toISOString())

    expect(rows[1]).toMatchObject({ event: 'reversed', reversed_by: null, reversed_by_name: 'System' })
  })

  it('flags a cancel the server could not confirm', async () => {
    const { store, rows } = memoryStore()
    await recordGovDiscount(store, request(), ACTOR, NOW)

    await reverseGovGrants(
      store,
      { tenantId: TENANT, backend: 'platform_supabase', externalOrderId: ORDER },
      ACTOR,
      NOW.toISOString(),
      ['reversal_unverified'],
    )

    expect(rows[1].flags).toEqual(['reversal_unverified'])
  })
})

describe('reverseIfCancelled (the app says an order was cancelled)', () => {
  const order = { tenantId: TENANT, backend: 'platform_supabase' as const, externalOrderId: ORDER }

  it('reverses only when the saved order really is cancelled', async () => {
    const open = memoryStore({ orderState: { readable: true, exists: true, cancelled: false, hasGovernment: true } })
    await recordGovDiscount(open.store, request(), ACTOR, NOW)
    const cancelled = memoryStore({ orderState: { readable: true, exists: true, cancelled: true, hasGovernment: true } })
    cancelled.rows.push(...open.rows)

    expect(await reverseIfCancelled(open.store, order, ACTOR, NOW.toISOString())).toEqual({ skipped: 'order_not_cancelled' })
    expect(await reverseIfCancelled(cancelled.store, order, ACTOR, NOW.toISOString())).toEqual({ reversed: 1 })
  })

  it('reverses an order the server cannot read, flagged', async () => {
    const { store, rows } = memoryStore({ orderState: { readable: false }, saved: null })
    await recordGovDiscount(store, request(), ACTOR, NOW)

    await reverseIfCancelled(store, order, ACTOR, NOW.toISOString())

    expect(rows.find((row) => row.event === 'reversed')?.flags).toEqual(['reversal_unverified'])
  })
})

describe('order ids', () => {
  it('accepts platform uuids, Convex ids and local ids', () => {
    for (const id of [ORDER, 'jd7abc0x9k2m', 'pos:local-1.2_3']) {
      expect(parseRecordRequest({ ...request({ externalOrderId: id }) }).ok).toBe(true)
    }
  })

  it('refuses wildcard and punctuation characters', () => {
    for (const id of ['%', 'abc_%', 'a b', "o'1", 'x*']) {
      expect(parseRecordRequest({ ...request({ externalOrderId: id }) }).ok).toBe(false)
    }
    expect(
      parseIdPhotoUploadRequest({
        tenantId: TENANT,
        backend: 'convex',
        externalOrderId: '%',
        claimantRef: 'c1',
        capturedAt: NOW.toISOString(),
        photo: 'data:image/jpeg;base64,AAAA',
      }).ok,
    ).toBe(false)
  })
})
