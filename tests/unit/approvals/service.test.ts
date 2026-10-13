/**
 * @jest-environment node
 */
import {
  createApproval,
  decideApproval,
  listApprovals,
  updateApprovalRules,
  withdrawApproval,
  type ApprovalsContext,
} from '@/lib/approvals/service'
import type { ApprovalsDb } from '@/lib/approvals/repository'
import type { ApprovalActor } from '@/lib/approvals/types'

const TENANT = '11111111-1111-4111-8111-111111111111'
const ORDER = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-10-12T06:00:00Z')

type Rows = Record<string, Record<string, unknown>[]>

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'req-1', tenant_id: TENANT, outlet_id: null, kind: 'refund', status: 'pending', is_direct: false,
    external_order_id: ORDER, order_number: '#14', payload: { scope: 'amount', amount: 185 }, amount: 185,
    reason_code: 'wrong_item', requested_by: 'u-ana', requested_by_name: 'Ana Santos',
    expires_at: '2026-10-12T06:30:00Z', created_at: '2026-10-12T05:59:00Z', updated_at: '2026-10-12T05:59:00Z',
    ...overrides,
  }
}

function fakeDb(rpcAnswers: Record<string, unknown>, rows: Rows = {}) {
  const rpc = jest.fn(async (fn: string) => ({ data: rpcAnswers[fn] ?? null, error: null }))
  const from = jest.fn((table: string) => {
    const data = rows[table] ?? []
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'neq', 'gte', 'in', 'order', 'limit', 'delete']) {
      builder[method] = jest.fn(() => builder)
    }
    builder.maybeSingle = jest.fn(async () => ({ data: data[0] ?? null, error: null }))
    builder.then = (resolve: (value: unknown) => unknown) => resolve({ data, error: null })
    return builder
  })
  return { db: { rpc, from } as unknown as ApprovalsDb, rpc, from }
}

function actor(overrides: Partial<ApprovalActor> = {}): ApprovalActor {
  return { userId: 'u-ana', role: 'admin', isOwner: false, permissions: ['pos', 'orders'], outletId: null, ...overrides }
}

function context(db: ApprovalsDb, who: ApprovalActor) {
  const scheduled: (() => Promise<void>)[] = []
  const deliver = jest.fn().mockResolvedValue({ recipients: 0, devices: 0, accepted: 0, refused: 0, staleRemoved: 0 })
  const ctx: ApprovalsContext = {
    db,
    actor: who,
    tenantId: TENANT,
    now: NOW,
    notifier: { deliver },
    schedule: (work) => { scheduled.push(work) },
    sideEffectDeps: async () => ({
      restoreWholeOrderStock: jest.fn(), restoreRevisionStock: jest.fn(), loadOrder: jest.fn().mockResolvedValue(null),
      releasePresell: jest.fn().mockResolvedValue(false), runLoyalty: jest.fn(), recordCancelEvent: jest.fn(), now: () => NOW,
    }),
  }
  return { ctx, scheduled, deliver }
}

const refundBody = {
  tenantId: TENANT, kind: 'refund' as const, orderId: ORDER, reasonCode: 'wrong_item', idempotencyKey: 'sheet_12345678',
  payload: { scope: 'amount' as const, amount: 185 },
}
const QUOTE_OK = { ok: true, amount: 185, orderCreatedAt: '2026-10-12T01:00:00Z', outletId: null }
const PLATFORM_TENANT = { tenants: [{ order_backend: 'platform', convex_deployment_url: null }] }

describe('createApproval', () => {
  test('a Convex store gets a clear 409 and nothing is written', async () => {
    const { db, rpc } = fakeDb({}, { tenants: [{ order_backend: 'convex', convex_deployment_url: 'https://x.convex.cloud' }] })
    const reply = await createApproval(context(db, actor()).ctx, refundBody)
    expect(reply.status).toBe(409)
    expect(reply.body).toMatchObject({ success: false, error: 'Refunds for this store type are coming soon.', code: 'backend_unsupported' })
    expect(rpc).not.toHaveBeenCalled()
  })

  test('a cashier without refund rights files a PENDING request and approvers are notified after the response', async () => {
    const { db, rpc } = fakeDb(
      { approval_quote: QUOTE_OK, create_approval_request: { ok: true, replayed: false, request: row() } },
      { ...PLATFORM_TENANT, app_users: [
        { user_id: 'u-lorna', role: 'admin', is_owner: true, permissions: null, outlet_id: null, display_name: 'Lorna' },
        { user_id: 'u-marco', role: 'admin', is_owner: false, permissions: ['approve_requests'], outlet_id: null, display_name: 'Marco' },
      ] },
    )
    const { ctx, scheduled } = context(db, actor())
    const reply = await createApproval(ctx, refundBody)
    expect(reply.status).toBe(201)
    expect(reply.body.data).toMatchObject({ route: 'request', approvers: ['Marco', 'Lorna'] })
    const createCall = rpc.mock.calls.find(([fn]) => fn === 'create_approval_request') as unknown as [string, Record<string, unknown>]
    expect(createCall[1]).toMatchObject({ p_user_id: 'u-ana', p_tenant_id: TENANT, p_direct: false })
    expect((createCall[1].p_payload as Record<string, unknown>).reasonLabel).toBe('Wrong item served')
    expect(scheduled).toHaveLength(1)
  })

  test('the owner acts directly through the one-transaction function', async () => {
    const { db, rpc } = fakeDb(
      { approval_quote: QUOTE_OK, create_and_execute_approval: { ok: true, request: row({ status: 'executed', is_direct: true, result: { scope: 'amount' } }) } },
      PLATFORM_TENANT,
    )
    const { ctx, scheduled } = context(db, actor({ userId: 'u-lorna', isOwner: true, permissions: null }))
    const reply = await createApproval(ctx, refundBody)
    expect(reply.body.data).toMatchObject({ route: 'direct' })
    expect(rpc.mock.calls.map(([fn]) => fn)).toContain('create_and_execute_approval')
    expect(scheduled).toHaveLength(1) // side effects
  })

  test('a database refusal (no open drawer for cash) comes back with its message', async () => {
    const { db } = fakeDb(
      { approval_quote: QUOTE_OK, create_approval_request: { ok: false, code: 'no_open_shift', message: 'Open your shift first.' } },
      PLATFORM_TENANT,
    )
    const reply = await createApproval(context(db, actor()).ctx, refundBody)
    expect(reply.status).toBe(409)
    expect(reply.body).toMatchObject({ code: 'no_open_shift', error: 'Open your shift first.' })
  })

  test('statutory discounts are refused before anything is read', async () => {
    const { db, rpc } = fakeDb({}, PLATFORM_TENANT)
    const reply = await createApproval(context(db, actor()).ctx, {
      tenantId: TENANT, kind: 'discount', orderId: ORDER, reasonCode: 'make_up', idempotencyKey: 'sheet_12345678',
      payload: { amountOff: 96, pct: 20, statutory: true },
    })
    expect(reply.status).toBe(422)
    expect(rpc).not.toHaveBeenCalled()
  })

  test('the discount percent comes from the database quote, not the client', async () => {
    const { db, rpc } = fakeDb(
      { approval_quote: { ...QUOTE_OK, amount: 192, pct: 40 }, create_approval_request: { ok: true, replayed: false, request: row({ kind: 'discount', amount: 192 }) } },
      { ...PLATFORM_TENANT, app_users: [] },
    )
    const reply = await createApproval(context(db, actor()).ctx, {
      tenantId: TENANT, kind: 'discount', orderId: ORDER, reasonCode: 'make_up', idempotencyKey: 'sheet_12345678',
      payload: { amountOff: 192, pct: 1 },
    })
    expect(reply.body.data).toMatchObject({ route: 'request' })
    expect(rpc.mock.calls.map(([fn]) => fn)).toContain('create_approval_request')
  })

  test('a replayed tap does not notify twice', async () => {
    const { db } = fakeDb(
      { approval_quote: QUOTE_OK, create_approval_request: { ok: true, replayed: true, request: row() } },
      { ...PLATFORM_TENANT, app_users: [] },
    )
    const { ctx, scheduled } = context(db, actor())
    const reply = await createApproval(ctx, refundBody)
    expect(reply.status).toBe(200)
    expect(scheduled).toHaveLength(0)
  })
})

describe('decideApproval', () => {
  const approve = { tenantId: TENANT, decision: 'approve' as const }

  test('nobody approves their own request (refused before the database call)', async () => {
    const { db, rpc } = fakeDb({ expire_approval_requests: 0 }, { approval_requests: [row({ requested_by: 'u-marco' })] })
    const reply = await decideApproval(context(db, actor({ userId: 'u-marco', permissions: ['approve_requests'] })).ctx, 'req-1', approve)
    expect(reply.status).toBe(403)
    expect(reply.body.code).toBe('self_approval')
    expect(rpc.mock.calls.map(([fn]) => fn)).not.toContain('decide_approval')
  })

  test('a peer who cannot see the request gets 404, not 403', async () => {
    const { db } = fakeDb({}, { approval_requests: [row()] })
    const reply = await decideApproval(context(db, actor({ userId: 'u-peer' })).ctx, 'req-1', approve)
    expect(reply.status).toBe(404)
  })

  test('approve → executed: follow-ups and the requester push are scheduled', async () => {
    const executed = row({ status: 'executed', decided_by: 'u-marco', decided_by_name: 'Marco', result: { refundLabel: 'R-0042', scope: 'amount' } })
    const { db } = fakeDb({ decide_approval: { ok: true, request: executed } }, { approval_requests: [row()] })
    const { ctx, scheduled } = context(db, actor({ userId: 'u-marco', permissions: ['approve_requests'] }))
    const reply = await decideApproval(ctx, 'req-1', approve)
    expect(reply.status).toBe(200)
    expect(reply.body.data).toMatchObject({ request: { status: 'executed', refundLabel: 'R-0042' } })
    expect(scheduled).toHaveLength(2)
  })

  test('an execution that failed after approval is reported as the failed request', async () => {
    const failed = row({ status: 'failed', decided_by: 'u-marco', error: 'The order changed since it was asked about. Nothing was refunded.' })
    const { db } = fakeDb({ decide_approval: { ok: false, code: 'order_changed', message: 'x', request: failed } }, { approval_requests: [row()] })
    const reply = await decideApproval(context(db, actor({ userId: 'u-marco', permissions: ['approve_requests'] })).ctx, 'req-1', approve)
    expect(reply.status).toBe(200)
    expect(reply.body.data).toMatchObject({ request: { status: 'failed' } })
  })

  test('a second approver gets 409 with who answered', async () => {
    const answered = row({ status: 'executed', decided_by: 'u-lorna', decided_by_name: 'Lorna' })
    const { db } = fakeDb(
      { decide_approval: { ok: false, code: 'not_pending', message: 'That request was already answered by Lorna.', request: answered } },
      { approval_requests: [row()] },
    )
    const reply = await decideApproval(context(db, actor({ userId: 'u-marco', permissions: ['approve_requests'] })).ctx, 'req-1', approve)
    expect(reply.status).toBe(409)
    expect(reply.body.error).toBe('That request was already answered by Lorna.')
  })
})

describe('withdrawApproval', () => {
  test('only the requester may withdraw', async () => {
    const { db } = fakeDb({}, { approval_requests: [row()] })
    const reply = await withdrawApproval(context(db, actor({ userId: 'u-lorna', isOwner: true })).ctx, 'req-1')
    expect(reply.status).toBe(403)
  })
})

describe('listApprovals', () => {
  test('a non-approver sees only their own pending requests', async () => {
    const { db } = fakeDb({}, { approval_requests: [row(), row({ id: 'req-2', requested_by: 'u-jomar' })] })
    const reply = await listApprovals(context(db, actor()).ctx, 'pending')
    expect(reply.body.data?.requests.map((r) => r.id)).toEqual(['req-1'])
    expect(reply.body.data?.isApprover).toBe(false)
  })
  test('an approver sees the inbox oldest first', async () => {
    const { db } = fakeDb({}, { approval_requests: [
      row({ id: 'late', created_at: '2026-10-12T05:59:30Z' }),
      row({ id: 'early', created_at: '2026-10-12T05:50:00Z', requested_by: 'u-jomar' }),
    ] })
    const reply = await listApprovals(context(db, actor({ userId: 'u-marco', permissions: ['approve_requests'] })).ctx, 'pending')
    expect(reply.body.data?.requests.map((r) => r.id)).toEqual(['early', 'late'])
  })
})

describe('updateApprovalRules', () => {
  test('only the owner may change the rules', async () => {
    const { db, rpc } = fakeDb({})
    const reply = await updateApprovalRules(context(db, actor({ permissions: ['approve_requests'] })).ctx, { tenantId: TENANT, directRefundCap: 900 })
    expect(reply.status).toBe(403)
    expect(rpc).not.toHaveBeenCalled()
  })
  test('the owner saves through set_approval_rules with their own id', async () => {
    const { db, rpc } = fakeDb({ set_approval_rules: { ok: true, rules: { directRefundCap: 900 } } })
    const reply = await updateApprovalRules(context(db, actor({ userId: 'u-lorna', isOwner: true })).ctx, { tenantId: TENANT, directRefundCap: 900 })
    expect(reply.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('set_approval_rules', { p_tenant_id: TENANT, p_actor: 'u-lorna', p_rules: { directRefundCap: 900 } })
  })
})
