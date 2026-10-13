/**
 * @jest-environment node
 */
import { notifyApprovers } from '@/lib/approvals/notifier'
import { DEFAULT_APPROVAL_RULES } from '@/lib/approvals/rules'
import type { ApprovalsDb } from '@/lib/approvals/repository'
import type { ApprovalRequestRecord } from '@/lib/approvals/types'

const NOW = new Date('2026-10-12T06:00:00Z')

function fakeDb(rows: Record<string, Record<string, unknown>[]>): ApprovalsDb {
  return {
    rpc: jest.fn(),
    from: jest.fn((table: string) => {
      const builder: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'gte', 'in', 'limit']) builder[method] = jest.fn(() => builder)
      builder.then = (resolve: (value: unknown) => unknown) => resolve({ data: rows[table] ?? [], error: null })
      return builder
    }),
  } as unknown as ApprovalsDb
}

const record: ApprovalRequestRecord = {
  id: 'req-new', tenantId: 't-1', outletId: null, kind: 'refund', status: 'pending', isDirect: false,
  externalOrderId: 'o-1', orderNumber: '#14', payload: {}, amount: 185, approvedAmount: null, reasonCode: 'wrong_item',
  note: null, orderSnapshot: null, requestedBy: 'u-ana', requestedByName: 'Ana', requesterShiftId: null,
  decidedBy: null, decidedByName: null, decidedAt: null, decisionReasonCode: null, decisionNote: null,
  expiresAt: '2026-10-12T06:30:00Z', executedAt: null, result: null, error: null,
  createdAt: '2026-10-12T05:59:30Z', updatedAt: '2026-10-12T05:59:30Z',
}

describe('notifyApprovers — batched pushes (L2)', () => {
  test("a manager's summary counts only the requests within THEIR limit", async () => {
    const db = fakeDb({
      app_users: [
        { user_id: 'u-marco', role: 'admin', is_owner: false, permissions: ['approve_requests'], outlet_id: null, display_name: 'Marco' },
        { user_id: 'u-lorna', role: 'admin', is_owner: true, permissions: null, outlet_id: null, display_name: 'Lorna' },
      ],
      approval_requests: [
        { id: 'req-new', kind: 'refund', amount: 185, outlet_id: null, requested_by: 'u-ana', requested_by_name: 'Ana' },
        { id: 'req-big', kind: 'refund', amount: 5000, outlet_id: null, requested_by: 'u-jomar', requested_by_name: 'Jomar' },
      ],
      platform_device_tokens: [],
    })
    const deliver = jest.fn().mockResolvedValue({ recipients: 2, devices: 0, accepted: 0, refused: 0, staleRemoved: 0 })
    await notifyApprovers(db, { deliver }, record, { ...DEFAULT_APPROVAL_RULES }, NOW)
    const recipients = deliver.mock.calls[0][0].recipients as { userId: string; content: { title: string } }[]
    const marco = recipients.find((r) => r.userId === 'u-marco')
    const lorna = recipients.find((r) => r.userId === 'u-lorna')
    // Marco can answer only the ₱185 one → a single-request push, not "2 waiting · ₱5,185".
    expect(marco?.content.title).toBe('Refund ₱185 · Order #14')
    expect(lorna?.content.title).toBe('2 requests waiting · ₱5,185')
  })
})
