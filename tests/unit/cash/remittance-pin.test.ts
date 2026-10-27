/**
 * "PIN here now" (CONTRACTS W2.3): who may ask, who may receive, and the
 * contract's answers — 404 not yours, 409 not pending, 412 no PIN set,
 * 422 wrong PIN {triesLeft}, 423 locked {lockedUntil}, 200 the row.
 */

import {
  PIN_COPY,
  PIN_TRIES_BEFORE_LOCK,
  PIN_TRIES_PER_CALLER_AND_RECEIVER,
  acceptRemittanceByPin,
  mayAskForPin,
  mayReceive,
  type PinCaller,
  type PinReceiver,
  type RemittancePinStore,
} from '@/lib/cash/remittance-pin'
import type { Remittance } from '@/lib/cash/remittances'

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OUTLET_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const OUTLET_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function remittance(overrides: Partial<Remittance> = {}): Remittance {
  return {
    id: 'r1',
    tenantId: TENANT,
    outletId: OUTLET_A,
    kind: 'shift',
    shiftId: 's1',
    businessDay: '2026-10-24',
    cashierUserId: 'ana',
    cashierName: 'Ana',
    handedOverCents: 634500,
    remittedTo: null,
    remittedToName: null,
    toSafe: false,
    status: 'pending',
    receivedCents: null,
    receivedByName: null,
    receivedAt: null,
    acceptMethod: null,
    isSelfReceived: false,
    receiverNote: null,
    disputeReason: null,
    resolvedAt: null,
    resolvedByName: null,
    resolvedNote: null,
    createdAt: '2026-10-24T18:50:00.000Z',
    ...overrides,
  }
}

const ANA: PinCaller = { userId: 'ana', role: 'admin', tenantId: TENANT, isOwner: false, outletId: OUTLET_A }
const MARIA: PinReceiver = { userId: 'maria', name: 'Maria', role: 'admin', isOwner: false, permissions: ['cash_manage'], outletId: null }

function store(overrides: Partial<RemittancePinStore> = {}) {
  const accepted: Array<Record<string, unknown>> = []
  const base: RemittancePinStore = {
    findRemittance: async () => remittance(),
    findReceiver: async () => MARIA,
    allowPinTry: async () => true,
    verifyPin: async () => 'ok',
    pinState: async () => ({ failedAttempts: 2, lockedUntil: null }),
    acceptAs: async (input) => {
      accepted.push(input)
      return { ok: true, remittance: remittance({ status: 'accepted', receivedCents: input.receivedCents, acceptMethod: 'pin' }) }
    },
    ...overrides,
  }
  return { store: base, accepted }
}

const INPUT = { remittanceId: 'r1', receiverUserId: 'maria', pin: '1234', receivedCents: 634500, note: null }

describe('mayAskForPin', () => {
  it('lets the cashier at the counter, or a member reaching the branch, ask', () => {
    const r = remittance()
    expect(mayAskForPin(ANA, r)).toBe(true)
    expect(mayAskForPin({ ...ANA, userId: 'ben' }, r)).toBe(true)
    expect(mayAskForPin({ ...ANA, userId: 'ben', outletId: null }, r)).toBe(true)
  })

  it('refuses another branch’s staff and another store', () => {
    const r = remittance()
    expect(mayAskForPin({ ...ANA, userId: 'ben', outletId: OUTLET_B }, r)).toBe(false)
    expect(mayAskForPin({ ...ANA, tenantId: 'other' }, r)).toBe(false)
    expect(mayAskForPin({ ...ANA, role: 'platform_staff' }, r)).toBe(false)
  })
})

describe('mayReceive', () => {
  it('needs cash_manage and the branch', () => {
    const r = remittance()
    expect(mayReceive(MARIA, r)).toBe(true)
    expect(mayReceive({ ...MARIA, permissions: ['pos', 'settings'] }, r)).toBe(false)
    expect(mayReceive({ ...MARIA, outletId: OUTLET_B }, r)).toBe(false)
    expect(mayReceive({ ...MARIA, outletId: OUTLET_A }, r)).toBe(true)
  })

  it('never lets the cashier receive their own cash, unless they own the store', () => {
    const r = remittance()
    expect(mayReceive({ ...MARIA, userId: 'ana' }, r)).toBe(false)
    expect(mayReceive({ ...MARIA, userId: 'ana', isOwner: true }, r)).toBe(true)
  })
})

describe('acceptRemittanceByPin', () => {
  it('accepts with the PIN through accept_remittance_as', async () => {
    const { store: s, accepted } = store()

    const outcome = await acceptRemittanceByPin(s, ANA, INPUT)

    expect(outcome.ok && outcome.remittance.status).toBe('accepted')
    expect(accepted).toEqual([{ id: 'r1', receiverUserId: 'maria', receivedCents: 634500, note: null }])
  })

  it('is 404 for a remittance the caller may not ask about (no leak)', async () => {
    const { store: hidden } = store({ findRemittance: async () => null })
    const { store: otherBranch } = store()

    expect(await acceptRemittanceByPin(hidden, ANA, INPUT)).toMatchObject({ ok: false, status: 404 })
    expect(await acceptRemittanceByPin(otherBranch, { ...ANA, userId: 'ben', outletId: OUTLET_B }, INPUT)).toMatchObject({ ok: false, status: 404 })
  })

  it('is 409 when it is no longer pending, before any PIN is checked', async () => {
    const verifyPin = jest.fn()
    const { store: s } = store({ findRemittance: async () => remittance({ status: 'accepted' }), verifyPin })

    expect(await acceptRemittanceByPin(s, ANA, INPUT)).toMatchObject({ ok: false, status: 409 })
    expect(verifyPin).not.toHaveBeenCalled()
  })

  it('is 409 when someone else answered while the PIN was checked (lost CAS)', async () => {
    const { store: s } = store({ acceptAs: async () => ({ ok: false, reason: 'not_pending' }) })

    expect(await acceptRemittanceByPin(s, ANA, INPUT)).toMatchObject({ ok: false, status: 409 })
  })

  it('needs a note for a different amount', async () => {
    const { store: s } = store()

    expect(await acceptRemittanceByPin(s, ANA, { ...INPUT, receivedCents: 600000 })).toMatchObject({ ok: false, status: 400 })
    expect((await acceptRemittanceByPin(s, ANA, { ...INPUT, receivedCents: 600000, note: '₱345 short' })).ok).toBe(true)
  })

  it('takes any amount without a note for an uncounted hand-over (the receiver’s count is the first one)', async () => {
    const { store: s } = store({ findRemittance: async () => remittance({ handedOverCents: null }) })

    expect((await acceptRemittanceByPin(s, ANA, { ...INPUT, receivedCents: 512000 })).ok).toBe(true)
  })

  it('is 403 for a receiver without cash_manage, and never checks their PIN', async () => {
    const verifyPin = jest.fn()
    const { store: s } = store({ findReceiver: async () => ({ ...MARIA, permissions: ['pos'] }), verifyPin })

    expect(await acceptRemittanceByPin(s, ANA, INPUT)).toMatchObject({ ok: false, status: 403 })
    expect(verifyPin).not.toHaveBeenCalled()
  })

  it('answers 429 once the shared PIN limits are spent, without checking the PIN', async () => {
    const verifyPin = jest.fn()
    const { store: s } = store({ allowPinTry: async () => false, verifyPin })

    expect(await acceptRemittanceByPin(s, ANA, INPUT)).toMatchObject({ ok: false, status: 429 })
    expect(verifyPin).not.toHaveBeenCalled()
  })

  it('gives one caller fewer tries at one receiver than it takes to lock their PIN', () => {
    // The lock is shared with Senior/PWD approvals: a cashier must not be able
    // to lock a manager out on purpose.
    expect(PIN_TRIES_PER_CALLER_AND_RECEIVER.limit).toBeLessThan(PIN_TRIES_BEFORE_LOCK)
    expect(PIN_TRIES_PER_CALLER_AND_RECEIVER.onRedisFailure).toBe('instance')
  })

  it('answers 412 "send to their phone" when the receiver has no PIN', async () => {
    const { store: s } = store({ verifyPin: async () => 'no_pin' })

    expect(await acceptRemittanceByPin(s, ANA, INPUT)).toEqual({ ok: false, status: 412, body: { error: PIN_COPY.noPin } })
  })

  it('answers 422 with the tries left on a wrong PIN, and accepts nothing', async () => {
    const { store: s, accepted } = store({ verifyPin: async () => 'wrong', pinState: async () => ({ failedAttempts: 3, lockedUntil: null }) })

    expect(await acceptRemittanceByPin(s, ANA, INPUT)).toEqual({ ok: false, status: 422, body: { error: PIN_COPY.wrongPin, triesLeft: 2 } })
    expect(accepted).toHaveLength(0)
  })

  it('answers 423 with when the lock ends', async () => {
    const { store: s } = store({ verifyPin: async () => 'locked', pinState: async () => ({ failedAttempts: 0, lockedUntil: '2026-10-24T19:05:00.000Z' }) })

    expect(await acceptRemittanceByPin(s, ANA, INPUT)).toEqual({
      ok: false,
      status: 423,
      body: { error: PIN_COPY.locked, lockedUntil: '2026-10-24T19:05:00.000Z' },
    })
  })
})
