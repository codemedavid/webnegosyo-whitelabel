/**
 * Remittances on the web (CONTRACTS W2.2): one parser for the table row and
 * the RPC answer, bounded RLS reads, and transitions that validate first and
 * turn a lost compare-and-set into "someone already answered".
 */

import type { CashRpcClient } from '@/lib/cash/cash-rpc'
import {
  REMITTANCE_CHANGED_MESSAGE,
  REMITTANCE_NOTE_REQUIRED,
  acceptRemittance,
  disputeRemittance,
  listRemittances,
  needsReceiverNote,
  parseRemittance,
  remittanceDifferenceCents,
  resolveRemittance,
} from '@/lib/cash/remittances'
import { fakeSupabaseTables } from '../../fixtures/fake-supabase-tables'

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ID,
    tenant_id: TENANT,
    outlet_id: null,
    kind: 'shift',
    shift_id: 's1',
    business_day: '2026-10-24',
    cashier_user_id: 'ana',
    cashier_name: 'Ana R.',
    handed_over_cents: '634500',
    remitted_to: 'maria',
    remitted_to_name: 'Maria',
    to_safe: false,
    status: 'pending',
    received_cents: null,
    received_by_name: null,
    received_at: null,
    accept_method: null,
    is_self_received: false,
    receiver_note: null,
    dispute_reason: null,
    resolved_at: null,
    resolved_by_name: null,
    resolved_note: null,
    created_at: '2026-10-24T18:50:00.000Z',
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

describe('parseRemittance', () => {
  it('reads the table row (bigint as text) and the RPC’s camelCase alike', () => {
    const fromRow = parseRemittance(row())
    const fromRpc = parseRemittance({ id: ID, tenantId: TENANT, kind: 'pickup', handedOverCents: 200000, status: 'accepted', receivedCents: 200000, acceptMethod: 'pin', createdAt: '2026-10-24T10:00:00.000Z' })

    expect(fromRow).toMatchObject({ handedOverCents: 634500, cashierName: 'Ana R.', remittedToName: 'Maria', status: 'pending', toSafe: false })
    expect(fromRpc).toMatchObject({ kind: 'pickup', handedOverCents: 200000, acceptMethod: 'pin', cashierName: 'Staff' })
  })

  it('keeps an uncounted hand-over (forced close) as null, never ₱0', () => {
    const uncounted = parseRemittance(row({ handed_over_cents: null }))

    expect(uncounted.handedOverCents).toBeNull()
    expect(remittanceDifferenceCents({ handedOverCents: null, receivedCents: 500000 })).toBeNull()
  })

  it('asks for a note only when a counted hand-over and the amount received differ', () => {
    expect(needsReceiverNote(634500, 600000)).toBe(true)
    expect(needsReceiverNote(634500, 634500)).toBe(false)
    expect(needsReceiverNote(null, 600000)).toBe(false)
  })

  it('reads an RPC answer in the table’s own snake_case (accept_remittance returns the row)', () => {
    const answered = parseRemittance(row({ status: 'resolved', dispute_reason: 'short', resolved_note: 'found it', resolved_by_name: 'Owner', resolved_at: '2026-10-25T01:00:00.000Z' }))

    expect(answered).toMatchObject({ status: 'resolved', resolvedNote: 'found it', resolvedByName: 'Owner' })
  })

  it('refuses a status outside the four', () => {
    expect(() => parseRemittance(row({ status: 'lost' }))).toThrow()
  })

  it('works out the difference only once something was received', () => {
    expect(remittanceDifferenceCents({ handedOverCents: 634500, receivedCents: null })).toBeNull()
    expect(remittanceDifferenceCents({ handedOverCents: 634500, receivedCents: 630000 })).toBe(-4500)
  })
})

describe('listRemittances', () => {
  it('reads the asked statuses, day and branch through the caller', async () => {
    const { client } = fakeSupabaseTables({
      cash_remittances: [
        row({ id: 'p1' }),
        row({ id: 'a1', status: 'accepted' }),
        row({ id: 'other-day', business_day: '2026-10-23' }),
        row({ id: 'other-store', tenant_id: 'x' }),
      ],
    })

    const list = await listRemittances(client, { tenantId: TENANT, statuses: ['pending'], businessDay: '2026-10-24', outletId: null })

    expect(list.map((r) => r.id)).toEqual(['p1'])
  })

  it('throws (never an empty inbox) when the read fails', async () => {
    const { client } = fakeSupabaseTables({}, { cash_remittances: 'boom' })

    await expect(listRemittances(client, { tenantId: TENANT, statuses: ['pending'], businessDay: null, outletId: null })).rejects.toThrow()
  })
})

describe('transitions', () => {
  const remittance = { id: ID, handedOverCents: 634500 }

  it('accepts the same amount with no note', async () => {
    const { client, calls } = rpc({ data: row({ status: 'accepted', received_cents: 634500 }), error: null })

    const result = await acceptRemittance(client, remittance, 634500, '  ')

    expect(calls).toEqual([{ fn: 'accept_remittance', args: { p_id: ID, p_received_cents: 634500, p_note: null } }])
    expect(result.ok && result.data.status).toBe('accepted')
  })

  it('needs a note for a different amount, before calling', async () => {
    const { client, calls } = rpc({ data: null, error: null })

    expect(await acceptRemittance(client, remittance, 630000, '')).toEqual({ ok: false, error: { kind: 'invalid', message: REMITTANCE_NOTE_REQUIRED } })
    expect(calls).toHaveLength(0)
  })

  it('says someone already answered when the compare-and-set lost', async () => {
    const { client } = rpc({ data: null, error: { code: 'P0002', message: 'remittance_not_pending' } })

    expect(await acceptRemittance(client, remittance, 634500, null)).toEqual({ ok: false, error: { kind: 'conflict', message: REMITTANCE_CHANGED_MESSAGE } })
  })

  it('disputes with a reason and an optional amount; resolves with a note', async () => {
    const { client, calls } = rpc({ data: row({ status: 'disputed' }), error: null })

    await disputeRemittance(client, ID, 'Envelope had ₱6,000', 600000)
    await resolveRemittance(client, ID, 'Counted again with Ana, found ₱345 in the drawer')

    expect(calls[0]).toEqual({ fn: 'dispute_remittance', args: { p_id: ID, p_reason: 'Envelope had ₱6,000', p_received_cents: 600000 } })
    expect(calls[1]).toEqual({ fn: 'resolve_remittance', args: { p_id: ID, p_note: 'Counted again with Ana, found ₱345 in the drawer' } })
  })

  it('refuses a dispute or resolve without words, and a bad id', async () => {
    const { client, calls } = rpc({ data: null, error: null })

    expect((await disputeRemittance(client, ID, ' ', null)).ok).toBe(false)
    expect((await resolveRemittance(client, ID, '')).ok).toBe(false)
    expect((await resolveRemittance(client, 'nope', 'fine')).ok).toBe(false)
    expect(calls).toHaveLength(0)
  })
})
