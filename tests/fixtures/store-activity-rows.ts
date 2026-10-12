/** Raw get_store_activity rows (snake_case, as PostgREST returns them). */
export const RAW_REFUND_ROW = {
  id: '6f1c2c1e-3b1a-4c6e-9a51-0c1d2e3f4a5b',
  outlet_id: '14fd49f0-c4f1-4b57-9473-0d2547f15cc7',
  outlet_name: 'Valenzuela',
  occurred_at: '2026-10-12T04:33:00.123+00:00',
  category: 'money',
  kind: 'refund.issued',
  is_routine: false,
  actor_user_id: '31140db3-eb9f-45c2-b0af-c94763106b67',
  actor_name: 'Ana Reyes',
  approved_by_name: null,
  amount: '-185.00',
  quantity: null,
  unit: null,
  reason: 'Wrong item served',
  note: null,
  subject_type: 'order',
  subject_ref: '9a1b2c3d-0000-4000-8000-000000000001',
  order_number: '#14',
  before: null,
  after: null,
  summary: { title: 'Refunded ₱185 on #14', paymentMethod: 'Cash' },
  flags: ['cash_refund_noncash_order', 'not_a_flag'],
  reviewed_at: null,
  reviewed_by_name: null,
}

export const RAW_STOCK_ROW = {
  ...RAW_REFUND_ROW,
  id: '6f1c2c1e-3b1a-4c6e-9a51-0c1d2e3f4a5c',
  category: 'stock',
  kind: 'stock.wasted',
  amount: -100,
  quantity: '-2.0000',
  unit: 'kg',
  reason: null,
  subject_type: 'ingredient',
  order_number: null,
  summary: null,
  flags: null,
}

/** A kind this build does not know yet (a newer server): dropped, never crashes. */
export const RAW_FUTURE_ROW = { ...RAW_REFUND_ROW, id: '6f1c2c1e-3b1a-4c6e-9a51-0c1d2e3f4a5d', kind: 'order.teleported' }

/** Category disagreeing with the kind: inconsistent, dropped. */
export const RAW_MISMATCH_ROW = { ...RAW_REFUND_ROW, id: '6f1c2c1e-3b1a-4c6e-9a51-0c1d2e3f4a5e', category: 'orders' }

export const RAW_SUMMARY = {
  byKind: [
    { kind: 'refund.issued', statutory: false, count: 2, amount: '-370.00', quantity: null },
    { kind: 'discount.applied', statutory: true, count: 1, amount: -20, quantity: null },
    { kind: 'order.teleported', statutory: false, count: 9, amount: null, quantity: null },
  ],
  byActor: [{ actorUserId: '31140db3-eb9f-45c2-b0af-c94763106b67', actorName: 'Ana Reyes', kind: 'refund.issued', count: 2, amount: -370 }],
  byDay: [{ day: '2026-10-12', kind: 'refund.issued', count: 2, amount: -370 }],
  flaggedOpen: 3,
}
