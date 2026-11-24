/**
 * Generated stores for the profit engine and its SQL twin: orders from
 * `reportOrdersArb`, plus the stock ledger (sales, voids for cancelled
 * orders — some written days later — and for live orders edited down, waste, counts, deliveries, transfers), dish costs at sale, expenses
 * in every group (some voided, some store-wide, some stock purchases) and
 * drawer pay-outs (some sorted into an expense).
 *
 * Everything is drawn in exact units: quantities and unit costs in 1/10 000
 * (numeric(16,4) / numeric(12,4)), money in centavos, so a one-centavo
 * difference between the engine and the SQL is a real one.
 */
import fc from 'fast-check'
import { manilaDay, type DrawerPayout, type LedgerMovement, type ProfitCategory, type ProfitExpense } from '@/lib/reports/profit-facts'
import { isLiveOrder, type ReportOrder } from '@/lib/reports/sales-model'
import { reportOrdersArb, type OrderWindow } from './report-orders'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** The store's categories: every group, the recurring system keys among them. */
export const PROFIT_CATEGORIES: readonly (Omit<ProfitCategory, 'id'> & { key: string })[] = [
  { key: 'ingredients', name: 'Ingredients (Palengke)', icon: 'IN', group: 'ingredients', systemKey: 'ingredients' },
  { key: 'ice', name: 'Ice (Yelo)', icon: 'IC', group: 'ingredients', systemKey: 'ice' },
  { key: 'wages', name: 'Salaries & wages (Sahod)', icon: 'SW', group: 'staff', systemKey: 'wages' },
  { key: 'rent', name: 'Rent (Upa)', icon: 'RE', group: 'occupancy', systemKey: 'rent' },
  { key: 'electricity', name: 'Electricity (Kuryente)', icon: 'EL', group: 'utilities', systemKey: 'electricity' },
  { key: 'water', name: 'Water (Tubig)', icon: 'WA', group: 'utilities', systemKey: 'water' },
  { key: 'delivery_fees', name: 'Delivery & rider fees', icon: 'DF', group: 'operating', systemKey: 'delivery_fees' },
  { key: 'permits', name: 'Permits & taxes', icon: 'PT', group: 'admin', systemKey: 'permits' },
  { key: 'other', name: 'Other', icon: 'OT', group: 'other', systemKey: 'other' },
  { key: 'equipment', name: 'Big purchase (equipment)', icon: 'EQ', group: 'capex', systemKey: 'equipment' },
  { key: 'owner_draw', name: 'Owner took cash', icon: 'OW', group: 'not_expense', systemKey: 'owner_draw' },
  { key: 'custom', name: 'Ukay supplies', icon: null, group: 'operating', systemKey: null },
]

export const BRANCHES = ['b-0', 'b-1', 'b-2'] as const

/** A store before ids are made real: local keys (`o-3`, `b-1`, `ice`, `p-2`). */
export interface ProfitStore {
  orders: ReportOrder[]
  /** order line id → dish cost text. */
  dishCosts: Array<{ lineId: string; unitCost: string }>
  movements: LedgerMovement[]
  expenses: Array<ProfitExpense & { id: string }>
  payouts: DrawerPayout[]
}

/** 1/10 000 units → numeric text ("-12.3456"). */
export function fourDecimals(units: number): string {
  const sign = units < 0 ? '-' : ''
  const abs = Math.abs(units)
  return `${sign}${Math.floor(abs / 10_000)}.${String(abs % 10_000).padStart(4, '0')}`
}

const branchArb = fc.constantFrom<string | null>(null, ...BRANCHES)
const costArb = fc.oneof(
  { weight: 1, arbitrary: fc.constant<number | null>(null) },
  { weight: 8, arbitrary: fc.integer({ min: 0, max: 5_000_000 }) },
  // A frozen cost that lands a sale on half a centavo.
  { weight: 1, arbitrary: fc.constant(50) },
)

/**
 * A few ingredients, so shelves (item × branch) build a history: opening
 * counts, fixes the same day, counts after sales (profit-facts isOpeningCount).
 */
const itemArb = fc.constantFrom('i-0', 'i-1', 'i-2')

const ledgerPlanArb = fc.record({
  isTracked: fc.boolean(),
  sales: fc.array(fc.record({ item: itemArb, quantity: fc.integer({ min: 1, max: 200_000 }), cost: costArb, lagMs: fc.integer({ min: 0, max: 30_000 }) }), {
    minLength: 1,
    maxLength: 3,
  }),
  lineCosts: fc.array(fc.option(fc.integer({ min: 0, max: 3_000_000 }), { freq: 3 }), { maxLength: 4 }),
  // When a cancel's void is written: often days later, so the sale and its void land in different windows.
  voidLagMs: fc.oneof(fc.constant(HOUR_MS), fc.integer({ min: HOUR_MS, max: 5 * DAY_MS })),
  // A live order edited down: one sale's stock comes back, the order still counts.
  isEditedDown: fc.boolean(),
  // Deleted from Settings: the order is gone, its ledger stays (stock_movements keep its id).
  isDeleted: fc.oneof({ weight: 5, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
})

const looseMovementArb = (window: OrderWindow) =>
  fc.record({
    reason: fc.constantFrom('waste', 'stocktake', 'receive', 'transfer_out', 'transfer_in'),
    item: itemArb,
    quantity: fc.integer({ min: -100_000, max: 100_000 }),
    cost: costArb,
    outlet: branchArb,
    at: fc.integer({ min: window.start, max: window.end - 1 }),
  })

/** A shelf's opening count and, often, a fix to it a few hours later (maybe the next business day). */
const openingArb = (window: OrderWindow) =>
  fc.record({
    item: itemArb,
    outlet: branchArb,
    at: fc.integer({ min: window.start, max: window.end - 1 }),
    quantity: fc.integer({ min: 1, max: 5_000_000 }),
    fix: fc.option(fc.record({ quantity: fc.integer({ min: -5_000_000, max: 5_000_000 }), lagMs: fc.integer({ min: 1, max: 12 * HOUR_MS }) }), { freq: 2 }),
    cost: costArb,
  })

/**
 * A shelf counted days ago, then a count that finds less and one that finds
 * more: back to back (one recount), or with a delivery between them (two counts).
 */
const recountArb = (window: OrderWindow) =>
  fc.record({
    item: itemArb,
    outlet: branchArb,
    at: fc.integer({ min: window.start, max: window.end - 1 }),
    sinceBaseMs: fc.integer({ min: DAY_MS, max: 3 * DAY_MS }),
    loss: fc.integer({ min: 1, max: 500_000 }),
    gain: fc.integer({ min: 1, max: 1_000_000 }),
    lagMs: fc.integer({ min: 2, max: 2 * HOUR_MS }),
    hasDeliveryBetween: fc.boolean(),
    cost: costArb,
  })

/**
 * A delivery typed in the wrong unit ("4000" kg for 4000 g) and a count that
 * fixes it: straight after, or with a sale / waste in between (then the count
 * measures the shelf). The shelf was counted days before, so the fix is no
 * opening count.
 */
const mistypedDeliveryArb = (window: OrderWindow) =>
  fc.record({
    item: itemArb,
    outlet: branchArb,
    at: fc.integer({ min: window.start, max: window.end - 1 }),
    sinceBaseMs: fc.integer({ min: DAY_MS, max: 3 * DAY_MS }),
    typed: fc.integer({ min: 1, max: 50_000_000 }),
    // What the count finds: the delivery undone, a unit slip (1/1000 arrived), 1-2% arrived, or anything.
    found: fc.oneof(
      fc.constantFrom<'undone' | 'unit_slip' | 'one_percent' | 'two_percent'>('undone', 'unit_slip', 'one_percent', 'two_percent'),
      fc.integer({ min: -60_000_000, max: 1_000_000 }),
    ),
    lagMs: fc.oneof(fc.integer({ min: 2, max: 30 * 60 * 1000 }), fc.integer({ min: 2, max: 2 * HOUR_MS })),
    between: fc.constantFrom<'nothing' | 'waste' | 'second_delivery' | 'recount'>('nothing', 'nothing', 'waste', 'second_delivery', 'recount'),
    cost: costArb,
  })

const expenseArb = (days: readonly string[]) =>
  fc.record({
    category: fc.integer({ min: 0, max: PROFIT_CATEGORIES.length - 1 }),
    amountCents: fc.oneof(fc.integer({ min: 1, max: 5_000_000 }), fc.constantFrom(1, 99, 1_500_000)),
    day: fc.constantFrom(...days),
    outlet: branchArb,
    isStockPurchase: fc.boolean(),
    isVoid: fc.oneof({ weight: 6, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
  })

const payoutArb = (window: OrderWindow) =>
  fc.record({
    amountCents: fc.integer({ min: 1, max: 500_000 }),
    outlet: branchArb,
    at: fc.integer({ min: window.start, max: window.end - 1 }),
    sorted: fc.constantFrom('no', 'no', 'recorded', 'void'),
    category: fc.integer({ min: 0, max: PROFIT_CATEGORIES.length - 1 }),
  })

function dayKeys(window: OrderWindow): string[] {
  const keys: string[] = []
  for (let at = window.start; at < window.end; at += DAY_MS) keys.push(manilaDay(at))
  return keys
}

/**
 * Stores spread over `window` (wider than the report's, so some rows fall
 * outside it). Orders keep `reportOrdersArb`'s ids; lines `o-3-l0`.
 */
export function profitStoreArb(window: OrderWindow, maxOrders = 12): fc.Arbitrary<ProfitStore> {
  const days = dayKeys(window)
  return fc
    .record({
      orders: reportOrdersArb({ minLength: 0, maxLength: maxOrders, window }),
      plans: fc.array(ledgerPlanArb, { minLength: maxOrders, maxLength: maxOrders }),
      // reportOrdersArb's fractional offsets cluster at the window's start; spread them evenly.
      times: fc.array(fc.integer({ min: window.start, max: window.end - 1 }), { minLength: maxOrders, maxLength: maxOrders }),
      loose: fc.array(looseMovementArb(window), { maxLength: 6 }),
      openings: fc.array(openingArb(window), { maxLength: 3 }),
      recounts: fc.array(recountArb(window), { maxLength: 2 }),
      mistyped: fc.array(mistypedDeliveryArb(window), { maxLength: 2 }),
      expenses: fc.array(expenseArb(days), { maxLength: 10 }),
      payouts: fc.array(payoutArb(window), { maxLength: 4 }),
    })
    .map(({ orders, plans, times, loose, openings, recounts, mistyped, expenses, payouts }) =>
      toStore(
        orders.map((order, index) => placedAt(order, times[index])),
        plans,
        [...loose, ...openings.flatMap(openingMoves), ...recounts.flatMap(recountMoves), ...mistyped.flatMap(mistypedMoves)],
        expenses,
        payouts,
      ),
    )
}

type Plan = (typeof ledgerPlanArb) extends fc.Arbitrary<infer T> ? T : never
type Loose = ReturnType<typeof looseMovementArb> extends fc.Arbitrary<infer T> ? T : never
type ExpenseDraft = ReturnType<typeof expenseArb> extends fc.Arbitrary<infer T> ? T : never
type PayoutDraft = ReturnType<typeof payoutArb> extends fc.Arbitrary<infer T> ? T : never

type Opening = ReturnType<typeof openingArb> extends fc.Arbitrary<infer T> ? T : never

function openingMoves(opening: Opening): Loose[] {
  const count = { reason: 'stocktake' as const, item: opening.item, outlet: opening.outlet, cost: opening.cost }
  const first: Loose = { ...count, quantity: opening.quantity, at: opening.at }
  return opening.fix ? [first, { ...count, quantity: opening.fix.quantity, at: opening.at + opening.fix.lagMs }] : [first]
}

type Recount = ReturnType<typeof recountArb> extends fc.Arbitrary<infer T> ? T : never

function recountMoves(recount: Recount): Loose[] {
  const count = { reason: 'stocktake' as const, item: recount.item, outlet: recount.outlet, cost: recount.cost }
  const delivery: Loose[] = recount.hasDeliveryBetween ? [{ ...count, reason: 'receive', quantity: 10_000, at: recount.at + 1 }] : []
  return [
    { ...count, quantity: 1_000_000, at: recount.at - recount.sinceBaseMs },
    { ...count, quantity: -recount.loss, at: recount.at },
    ...delivery,
    { ...count, quantity: recount.gain, at: recount.at + recount.lagMs },
  ]
}

type Mistyped = ReturnType<typeof mistypedDeliveryArb> extends fc.Arbitrary<infer T> ? T : never

function mistypedMoves(fix: Mistyped): Loose[] {
  const shelf = { item: fix.item, outlet: fix.outlet, cost: fix.cost }
  const base: Loose = { ...shelf, reason: 'stocktake', quantity: 1_000_000, at: fix.at - fix.sinceBaseMs }
  const delivery: Loose = { ...shelf, reason: 'receive', quantity: fix.typed, at: fix.at }
  const middle: Loose[] =
    fix.between === 'waste'
      ? [{ ...shelf, reason: 'waste', quantity: -1, at: fix.at + 1 }]
      : fix.between === 'second_delivery'
        ? [{ ...shelf, reason: 'receive', quantity: 10_000, at: fix.at + 1 }]
        : []
  const arrived = { undone: 0, unit_slip: Math.floor(fix.typed / 1000), one_percent: Math.floor(fix.typed / 100), two_percent: Math.floor(fix.typed / 50) }
  const countDelta = typeof fix.found === 'number' ? fix.found : arrived[fix.found] - fix.typed
  const count: Loose = { ...shelf, reason: 'stocktake', quantity: countDelta, at: fix.at + fix.lagMs }
  // A second count straight after the first: one recount with it.
  const again: Loose[] = fix.between === 'recount' ? [{ ...shelf, reason: 'stocktake', quantity: 0, at: fix.at + fix.lagMs + 1 }] : []
  return [base, delivery, ...middle, count, ...again]
}

function placedAt(order: ReportOrder, at: number): ReportOrder {
  const shift = at - order.at
  return { ...order, at, payments: order.payments.map((payment) => ({ ...payment, at: payment.at + shift })) }
}


/** A movement before `toStore` numbers the store's ledger. */
type Unnumbered = Omit<LedgerMovement, 'id'>

function orderMovements(order: ReportOrder, plan: Plan): Unnumbered[] {
  if (!plan.isTracked) return []
  const sales = plan.sales.map(
    (sale): Unnumbered => ({
      reason: 'sale',
      inventoryItemId: sale.item,
      quantityDelta: fourDecimals(-sale.quantity),
      unitCost: sale.cost === null ? null : fourDecimals(sale.cost),
      orderId: order.id,
      outletId: order.outletId,
      at: order.at + sale.lagMs,
    }),
  )
  const isReversed = !isLiveOrder(order)
  const giveBack = (sale: Unnumbered): Unnumbered => ({
    ...sale,
    reason: 'void',
    quantityDelta: String(sale.quantityDelta).slice(1),
    at: sale.at + plan.voidLagMs,
  })
  // A cancelled order gives back exactly what it took, at the same cost, maybe days later.
  // A live order edited down gives back its first sale and keeps counting.
  const voids = isReversed ? sales.map(giveBack) : plan.isEditedDown ? [giveBack(sales[0])] : []
  return [...sales, ...voids]
}

function toStore(orders: ReportOrder[], plans: Plan[], loose: Loose[], drafts: ExpenseDraft[], payoutDrafts: PayoutDraft[]): ProfitStore {
  const dishCosts = orders.flatMap((order, index) =>
    order.lines.flatMap((line, lineIndex) => {
      const cost = plans[index]?.lineCosts[lineIndex]
      return cost === undefined || cost === null ? [] : [{ lineId: line.id, unitCost: fourDecimals(cost) }]
    }),
  )
  const unnumbered = [
    ...orders.flatMap((order, index) => orderMovements(order, plans[index])),
    ...loose.map(
      (move): Unnumbered => ({
        reason: move.reason,
        inventoryItemId: move.item,
        // Waste only ever takes stock out.
        quantityDelta: fourDecimals(move.reason === 'waste' ? -Math.abs(move.quantity) : move.quantity),
        unitCost: move.cost === null ? null : fourDecimals(move.cost),
        orderId: null,
        outletId: move.outlet,
        at: move.at,
      }),
    ),
  ]
  const movements = unnumbered.map((move, index) => ({ ...move, id: `mv-${index}` }))
  const expenses = drafts.map((draft, index) => ({
    id: `x-${index}`,
    categoryId: PROFIT_CATEGORIES[draft.category].key,
    amountCents: draft.amountCents,
    spentOn: draft.day,
    outletId: draft.outlet,
    isStockPurchase: draft.isStockPurchase,
    status: draft.isVoid ? ('void' as const) : ('recorded' as const),
    shiftCashMovementId: null,
  }))
  const payouts = payoutDrafts.flatMap((draft, index): DrawerPayout[] => {
    const payout: DrawerPayout = { id: `p-${index}`, kind: 'pay_out', amount: (draft.amountCents / 100).toFixed(2), outletId: draft.outlet, at: draft.at }
    // Voiding a drawer expense puts the cash back with a pay_in on the same shift.
    return draft.sorted === 'void' ? [payout, { ...payout, id: `pi-${index}`, kind: 'pay_in', at: draft.at + 60_000 }] : [payout]
  })
  // A sorted pay-out is a drawer expense: its amount, branch and Manila day.
  const drawerExpenses = payoutDrafts.flatMap((draft, index) =>
    draft.sorted === 'no'
      ? []
      : [
          {
            id: `xd-${index}`,
            categoryId: PROFIT_CATEGORIES[draft.category].key,
            amountCents: draft.amountCents,
            spentOn: manilaDay(draft.at),
            outletId: draft.outlet,
            isStockPurchase: false,
            status: draft.sorted === 'void' ? ('void' as const) : ('recorded' as const),
            shiftCashMovementId: `p-${index}`,
          },
        ],
  )
  // Deleted orders: gone from the store (and their dish costs with their lines), ledger kept.
  const deleted = new Set(orders.filter((_, index) => plans[index]?.isDeleted).map((order) => order.id))
  const kept = orders.filter((order) => !deleted.has(order.id))
  const keptLines = new Set(kept.flatMap((order) => order.lines.map((line) => line.id)))
  return {
    orders: kept,
    dishCosts: dishCosts.filter((cost) => keptLines.has(cost.lineId)),
    movements,
    expenses: [...expenses, ...drawerExpenses],
    payouts,
  }
}
