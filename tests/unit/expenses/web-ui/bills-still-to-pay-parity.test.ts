/**
 * "Still to pay" is ONE rule on the web and in the app: the engine's
 * `stillToPay` over the engine's occurrences, nothing filtered on top. The app
 * pins the same fixture and the same numbers in
 * webnegosyo-app/lib/expenses/bills-still-to-pay-parity.test.ts — change both.
 *
 * Today is Thursday 2026-10-22 (Manila):
 *  - Rent ₱15,000 on the 5th, paid only for August: September and October late.
 *  - Kuryente changes every time, on the 24th: ₱6,000 then ₱6,400 → about ₱6,200.
 *  - Tubig ₱500 on the 10th and 28th, paused 1 → 25 Oct: the 10th was swallowed
 *    by the pause, the 28th is still to pay this month.
 */
import { buildBillBoard } from '@/components/admin/expenses/bills/bill-board-model'
import { billsDue, monthKeyOf, stillToPay, type Bill, type BillPayment } from '@/lib/expenses/bill-schedule'

const TODAY = '2026-10-22'

function billOf(overrides: Partial<Bill>): Bill {
  return {
    id: 'bill-rent',
    tenantId: 't1',
    outletId: null,
    name: 'Rent',
    categoryId: 'rent',
    supplierId: null,
    paidToName: null,
    paidFrom: 'cash',
    amountCents: 1_500_000,
    rule: { kind: 'monthly', day: 5 },
    startsOn: '2026-08-01',
    endsOn: null,
    remindDaysBefore: 1,
    status: 'active',
    pausedUntil: null,
    pausedOn: null,
    createdAt: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

const paid = (billId: string, dueOn: string, amountCents: number): BillPayment => ({
  billId,
  dueOn,
  expenseId: `exp-${billId}-${dueOn}`,
  amountCents,
  spentOn: dueOn,
})

const BILLS: Bill[] = [
  billOf({}),
  billOf({ id: 'bill-kuryente', name: 'Kuryente', categoryId: 'electricity', amountCents: null, rule: { kind: 'monthly', day: 24 } }),
  billOf({
    id: 'bill-tubig',
    name: 'Tubig',
    categoryId: 'water',
    amountCents: 50_000,
    rule: { kind: 'twice_monthly', days: [10, 28] },
    status: 'paused',
    pausedOn: '2026-10-01',
    pausedUntil: '2026-10-25',
  }),
]
const PAYMENTS: BillPayment[] = [
  paid('bill-rent', '2026-08-05', 1_500_000),
  paid('bill-kuryente', '2026-08-24', 600_000),
  paid('bill-kuryente', '2026-09-24', 640_000),
  paid('bill-tubig', '2026-09-10', 50_000),
  paid('bill-tubig', '2026-09-28', 50_000),
]
const EXPECTED = { cents: 3_670_000, count: 4, hasEstimate: true }

describe('still to pay: one rule on both surfaces', () => {
  it('equals the engine over its own occurrences (a pause ending mid-month, a late rent, a changing kuryente)', () => {
    const engine = stillToPay(billsDue(BILLS, { today: TODAY, payments: PAYMENTS, marks: [] }), monthKeyOf(TODAY))

    const { summary } = buildBillBoard({ bills: BILLS, payments: PAYMENTS, marks: [], today: TODAY })

    expect(engine).toEqual(EXPECTED)
    expect(summary).toEqual(EXPECTED)
  })

  it('still lists the paused bill only under Paused while its pause runs', () => {
    const board = buildBillBoard({ bills: BILLS, payments: PAYMENTS, marks: [], today: TODAY })

    expect(board.paused.map((bill) => bill.name)).toEqual(['Tubig'])
    expect(board.groups.flatMap((group) => group.rows).some((row) => row.bill.id === 'bill-tubig')).toBe(false)
  })
})
