import type { ExpenseRow } from '@/lib/expenses/rows'

/** One recorded cash expense row, as PostgREST returns it. */
export function expenseRow(overrides: Partial<ExpenseRow> = {}): ExpenseRow {
  return {
    id: 'exp-1',
    tenant_id: 'tenant-1',
    outlet_id: null,
    category_id: 'cat-lpg',
    supplier_id: null,
    paid_to_name: 'Petron',
    staff_user_id: null,
    note: null,
    amount_cents: 125_000,
    spent_on: '2026-10-21',
    paid_from: 'cash',
    shift_cash_movement_id: null,
    is_stock_purchase: false,
    doc_type: null,
    invoice_no: null,
    supplier_tin: null,
    vat_cents: null,
    ewt_cents: null,
    ewt_rate: null,
    form_2307_given: false,
    status: 'recorded',
    void_reason: null,
    voided_by: null,
    voided_at: null,
    replaces_expense_id: null,
    client_request_id: 'req-1',
    created_by: 'user-1',
    created_by_name: 'Ana',
    created_at: '2026-10-21T02:00:00.000Z',
    ...overrides,
  }
}
