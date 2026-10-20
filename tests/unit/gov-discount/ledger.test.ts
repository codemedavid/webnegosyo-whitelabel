/**
 * The sales book: re-pricing, flags, reversals, idempotency and approvals —
 * against an in-memory store, so every rule is pinned without a database.
 */
import { describe, it, expect } from '@jest/globals'
import {
  computeGovDiscount,
  defaultTaxProfile,
  type RecordGovDiscountRequest,
  type StoredGovDiscount,
  type TaxProfile,
} from '@/lib/gov-discount'
import {
  manilaDayStart,
  recordGovDiscount,
  type ActiveGrant,
  type ClaimRow,
  type LedgerStore,
} from '@/lib/gov-discount-ledger/record-service'
import { linesMatch, verifyGrant } from '@/lib/gov-discount-ledger/verify'
import {
  approveGrant,
  canApprove,
  listApprovers,
  setOwnApprovalPin,
  type ApprovalStore,
  type ApproverRecord,
} from '@/lib/gov-discount-ledger/approval-service'
import { parseRecordRequest, isWeakPin } from '@/lib/gov-discount-ledger/request-schemas'
import { reverseGovGrants } from '@/lib/gov-discount-ledger/reverse-on-cancel'

const TENANT = '11111111-1111-4111-8111-111111111111'
const ORDER = '22222222-2222-4222-8222-222222222222'
const LINE = { key: 'k1', menuItemId: 'm1', name: 'Sisig', quantity: 1, amount: 560 }

function government(overrides: Partial<{ vatStatus: 'vat' | 'non_vat'; reduction: number }> = {}): StoredGovDiscount {
  const priced = computeGovDiscount({
    vatStatus: overrides.vatStatus ?? 'vat',
    lines: [{ key: 'k1', name: 'Sisig', quantity: 1, amount: 560, eligible: true }],
    claimants: [
      { id: 'c1', kind: 'senior', name: 'Juan Dela Cruz', idNumber: '12345', allocation: { mode: 'items', units: { k1: 1 } } },
    ],
  })
  if (!priced.ok) throw new Error('fixture must price')
  const claimants = overrides.reduction === undefined
    ? priced.claimants
    : priced.claimants.map((claimant) => ({ ...claimant, reduction: overrides.reduction! }))
  return { version: 1, vatStatus: overrides.vatStatus ?? 'vat', serviceChargeMode: 'full', diners: null, claimants, vat: null }
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
    lines: [LINE],
    serviceCharge: 0,
    deliveryFee: 0,
    allowShared: true,
    government: government(),
    approvalId: null,
    approvalSkippedOffline: false,
    ...overrides,
  }
}

function memoryStore(options: {
  profile?: TaxProfile | null
  excluded?: string[]
  saved?: { menuItemId: string | null; quantity: number; amount: number }[] | null
  approval?: { approvalId: string; approverUserId: string; approverName: string } | null
  reusedIds?: string[]
} = {}) {
  const rows: ClaimRow[] = []
  const key = (row: ClaimRow) =>
    [row.backend, row.external_order_id, row.revision, row.claimant_ref, row.event].join('|')
  const store: LedgerStore = {
    loadTaxProfile: async () => (options.profile === undefined ? defaultTaxProfile('vat') : options.profile),
    loadExcludedMenuItemIds: async () => new Set(options.excluded ?? []),
    loadSavedLines: async () => (options.saved === undefined ? [{ menuItemId: 'm1', quantity: 1, amount: 560 }] : options.saved),
    loadOrderState: async () => ({ readable: true, exists: true, cancelled: false, hasGovernment: false }),
    highestRevision: async () => (rows.length === 0 ? null : Math.max(...rows.map((row) => row.revision))),
    consumeApproval: async () => options.approval ?? null,
    idsUsedElsewhere: async () => new Set(options.reusedIds ?? []),
    listActiveGrants: async (): Promise<ActiveGrant[]> => {
      const reversed = new Set(rows.filter((r) => r.event === 'reversed').map((r) => `${r.revision}|${r.claimant_ref}`))
      return rows
        .filter((r) => r.event === 'granted' && !reversed.has(`${r.revision}|${r.claimant_ref}`))
        .map((row) => ({ revision: row.revision, claimantRef: row.claimant_ref, row }))
    },
    insertClaims: async (incoming) => {
      const fresh = incoming.filter((row) => !rows.some((existing) => key(existing) === key(row)))
      rows.push(...fresh)
      return fresh.length
    },
  }
  return { store, rows }
}

const ACTOR = { userId: 'cashier-1', name: 'Ana' }
const NOW = new Date('2026-10-12T04:05:00.000Z')

describe('recordGovDiscount', () => {
  it('records an honest grant as verified, with no flags', async () => {
    const { store, rows } = memoryStore()

    const outcome = await recordGovDiscount(store, request(), ACTOR, NOW)

    expect(outcome).toEqual({ granted: 1, reversed: 0, verification: 'verified', flags: [] })
    expect(rows[0]).toMatchObject({
      kind: 'senior',
      id_number: '12345',
      gross_share: 560,
      vat_exempt_sales: 500,
      discount: 100,
      reduction: 160,
      server_reduction: 160,
      granted_by: 'cashier-1',
      granted_by_name: 'Ana',
    })
  })

  it('flags a register that took off more than the rules allow', async () => {
    const { store, rows } = memoryStore()

    const outcome = await recordGovDiscount(store, request({ government: government({ reduction: 300 }) }), ACTOR, NOW)

    expect(outcome.verification).toBe('mismatch')
    expect(rows[0].flags).toContain('amount_mismatch')
    expect(rows[0].server_reduction).toBe(160)
  })

  it('flags lines that do not match the saved order', async () => {
    const { store } = memoryStore({ saved: [{ menuItemId: 'm1', quantity: 1, amount: 999 }] })

    const outcome = await recordGovDiscount(store, request(), ACTOR, NOW)

    expect(outcome.flags).toContain('lines_differ')
    expect(outcome.verification).toBe('mismatch')
  })

  it('flags an item the store excluded', async () => {
    const { store } = memoryStore({ excluded: ['m1'] })

    const outcome = await recordGovDiscount(store, request(), ACTOR, NOW)

    expect(outcome.flags).toContain('ineligible_item')
  })

  it('verifies a Convex order from its own lines only', async () => {
    const { store } = memoryStore({ saved: null })

    const outcome = await recordGovDiscount(store, request({ backend: 'convex', externalOrderId: 'jd7abc' }), ACTOR, NOW)

    expect(outcome.verification).toBe('payload_only')
  })

  it('demands the approval the store requires — offline is named as such', async () => {
    const strict = { ...defaultTaxProfile('vat'), approvalRule: 'always' as const }

    const missing = await recordGovDiscount(memoryStore({ profile: strict }).store, request(), ACTOR, NOW)
    const offline = await recordGovDiscount(
      memoryStore({ profile: strict }).store,
      request({ approvalSkippedOffline: true }),
      ACTOR,
      NOW,
    )

    expect(missing.flags).toContain('approval_missing')
    expect(offline.flags).toContain('unapproved_offline')
  })

  it('signs the approver onto the row, and calls out self-approval', async () => {
    const { store, rows } = memoryStore({
      profile: { ...defaultTaxProfile('vat'), approvalRule: 'always' },
      approval: { approvalId: 'a1', approverUserId: 'cashier-1', approverName: 'Ana' },
    })

    const outcome = await recordGovDiscount(store, request({ approvalId: '33333333-3333-4333-8333-333333333333' }), ACTOR, NOW)

    expect(rows[0]).toMatchObject({ approval_id: 'a1', approved_by_name: 'Ana' })
    expect(outcome.flags).toEqual(['self_approved'])
  })

  it('flags an ID already used on another order today', async () => {
    const { store } = memoryStore({ reusedIds: ['12345'] })

    const outcome = await recordGovDiscount(store, request(), ACTOR, NOW)

    expect(outcome.flags).toContain('id_reused_today')
  })

  it('is idempotent: a retried request adds nothing', async () => {
    const { store, rows } = memoryStore()

    await recordGovDiscount(store, request(), ACTOR, NOW)
    const retry = await recordGovDiscount(store, request(), ACTOR, NOW)

    expect(retry.granted).toBe(0)
    expect(rows).toHaveLength(1)
  })

  it('reverses the earlier revision when an edit re-grants', async () => {
    const { store, rows } = memoryStore({ saved: null })
    await recordGovDiscount(store, request(), ACTOR, NOW)

    const edit = await recordGovDiscount(store, request({ revision: 1 }), ACTOR, NOW)

    expect(edit).toMatchObject({ granted: 1, reversed: 1 })
    expect(rows.map((row) => `${row.revision}:${row.event}`)).toEqual(['0:granted', '0:reversed', '1:granted'])
    expect(rows[2].flags).toContain('edited')
    expect(rows[1]).toMatchObject({ granted_by_name: 'Ana', reversed_by_name: 'Ana' })
  })

  it('reverses everything when the discount is removed or the order cancelled', async () => {
    const { store, rows } = memoryStore()
    await recordGovDiscount(store, request(), ACTOR, NOW)

    const removed = await recordGovDiscount(store, request({ revision: 1, government: null }), ACTOR, NOW)

    expect(removed).toEqual({ granted: 0, reversed: 1, verification: 'none', flags: [] })
    expect(rows.filter((row) => row.event === 'reversed')).toHaveLength(1)
  })
})

describe('verify helpers', () => {
  it('matches lines as a multiset', () => {
    const a = { menuItemId: 'a', quantity: 1, amount: 10 }
    const b = { menuItemId: 'b', quantity: 2, amount: 20 }
    expect(linesMatch([a, b], [b, a])).toBe(true)
    expect(linesMatch([a, b], [a, a])).toBe(false)
  })

  it('flags a VAT setting that changed since the sale', () => {
    const verdict = verifyGrant({
      request: request({ government: government({ vatStatus: 'non_vat' }) }),
      profile: defaultTaxProfile('vat'),
      excludedMenuItemIds: new Set(),
      savedLines: null,
      isApproved: false,
      isSelfApproved: false,
    })
    expect(verdict.orderFlags).toContain('vat_status_changed')
  })

  it('reads Manila midnight', () => {
    expect(manilaDayStart(new Date('2026-10-12T17:30:00.000Z'))).toBe('2026-10-12T16:00:00.000Z')
    expect(manilaDayStart(new Date('2026-10-12T15:59:00.000Z'))).toBe('2026-10-11T16:00:00.000Z')
  })
})

describe('parseRecordRequest', () => {
  it('accepts a well-formed request and re-reads the government block', () => {
    const parsed = parseRecordRequest(JSON.parse(JSON.stringify(request())))
    expect(parsed.ok).toBe(true)
  })

  it('refuses a body that names its own actor', () => {
    const parsed = parseRecordRequest({ ...request(), grantedBy: 'someone-else' })
    expect(parsed.ok).toBe(false)
  })

  it('refuses a junk government block', () => {
    const parsed = parseRecordRequest({ ...request(), government: { version: 1 } })
    expect(parsed.ok).toBe(false)
  })
})

describe('manager approval', () => {
  const owner: ApproverRecord = { userId: 'u-owner', name: 'Owner', role: 'admin', isOwner: true, permissions: [], outletId: null }
  const manager: ApproverRecord = { userId: 'u-mgr', name: 'Mara', role: 'admin', isOwner: false, permissions: ['discount_review'], outletId: 'north' }
  const cashier: ApproverRecord = { userId: 'u-cash', name: 'Ana', role: 'admin', isOwner: false, permissions: ['pos'], outletId: null }

  function approvalStore(pinVerdict: 'ok' | 'wrong' | 'locked' | 'no_pin' = 'ok') {
    const created: unknown[] = []
    const pins: string[] = []
    const store: ApprovalStore = {
      findAccount: async (_tenant, userId) => [owner, manager, cashier].find((a) => a.userId === userId) ?? null,
      listAccounts: async () => [owner, manager, cashier],
      usersWithPins: async () => new Set(['u-mgr']),
      verifyPin: async () => pinVerdict,
      setPin: async (_user, _tenant, pin) => {
        pins.push(pin)
      },
      createApproval: async (row) => {
        created.push(row)
        return { id: 'approval-1', expiresAt: '2026-10-12T05:00:00.000Z' }
      },
    }
    return { store, created, pins }
  }

  const ask = (approverUserId: string, outletId: string | null = null) => ({
    tenantId: TENANT,
    approverUserId,
    pin: '8642',
    reduction: 600,
    outletId,
    claimants: [{ kind: 'senior' as const, name: 'Juan', idMasked: '••••2345' }],
  })

  it('lets the owner and a reviewer approve, never a plain cashier', () => {
    expect(canApprove(owner, 'south')).toBe(true)
    expect(canApprove(manager, 'north')).toBe(true)
    expect(canApprove(manager, 'south')).toBe(false)
    expect(canApprove(cashier, null)).toBe(false)
  })

  it('issues a one-time approval for the right PIN', async () => {
    const { store, created } = approvalStore('ok')

    const outcome = await approveGrant(store, ask('u-mgr', 'north'), { userId: 'u-cash', name: 'Ana' })

    expect(outcome).toEqual({ ok: true, approvalId: 'approval-1', approverName: 'Mara', expiresAt: '2026-10-12T05:00:00.000Z' })
    expect(created).toHaveLength(1)
  })

  it('explains a wrong, locked or missing PIN', async () => {
    for (const [verdict, status] of [['wrong', 400], ['locked', 423], ['no_pin', 400]] as const) {
      const outcome = await approveGrant(approvalStore(verdict).store, ask('u-owner'), { userId: 'u-cash', name: 'Ana' })
      expect(outcome.ok || outcome.status).toBe(status)
    }
  })

  it('refuses an approver who cannot approve here, before any PIN check', async () => {
    const outcome = await approveGrant(approvalStore('ok').store, ask('u-cash'), { userId: 'u-cash', name: 'Ana' })
    expect(outcome.ok || outcome.status).toBe(403)
  })

  it('offers only people who may approve at this branch, PIN holders first', async () => {
    const choices = await listApprovers(approvalStore().store, TENANT, 'north')
    expect(choices.map((choice) => choice.name)).toEqual(['Mara', 'Owner'])
  })

  it('refuses weak PINs and PINs for non-approvers', async () => {
    const { store, pins } = approvalStore()
    expect(isWeakPin('1234')).toBe(true)
    expect(isWeakPin('7777')).toBe(true)
    expect(await setOwnApprovalPin(store, TENANT, 'u-mgr', '1234')).toMatchObject({ ok: false, status: 400 })
    expect(await setOwnApprovalPin(store, TENANT, 'u-cash', '8642')).toMatchObject({ ok: false, status: 403 })
    expect(await setOwnApprovalPin(store, TENANT, 'u-mgr', '8642')).toEqual({ ok: true })
    expect(pins).toEqual(['8642'])
  })
})

describe('reverseGovGrants (a cancelled order)', () => {
  it('reverses every standing grant once, keeping the original granter', async () => {
    const { store, rows } = memoryStore()
    await recordGovDiscount(store, request(), ACTOR, NOW)
    const order = { tenantId: TENANT, backend: 'platform_supabase' as const, externalOrderId: ORDER }

    const first = await reverseGovGrants(store, order, { userId: 'mgr', name: 'Mara' }, NOW.toISOString())
    const again = await reverseGovGrants(store, order, { userId: 'mgr', name: 'Mara' }, NOW.toISOString())

    expect([first, again]).toEqual([1, 0])
    expect(rows[1]).toMatchObject({ event: 'reversed', granted_by_name: 'Ana', reversed_by_name: 'Mara' })
  })
})
