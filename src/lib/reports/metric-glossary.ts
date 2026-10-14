/**
 * The words behind every ⓘ on the sales reports (plan §5). One entry per
 * metric, so a tile and a ledger line can never explain the same number two
 * ways. Wording follows §2.3: no "Official Receipt", "Z-reading" or "VAT"
 * claims here.
 */

export interface MetricEntry {
  term: string
  definition: string
  formula?: string
}

export type MetricKey =
  | 'gross'
  | 'discounts'
  | 'net'
  | 'service'
  | 'delivery'
  | 'billed'
  | 'collected'
  | 'unpaid'
  | 'overpaid'
  | 'orders'
  | 'aov'
  | 'voids'
  | 'item_net'

export const METRIC_GLOSSARY: Readonly<Record<MetricKey, MetricEntry>> = {
  gross: {
    term: 'Gross sales',
    definition: 'What the food and drinks came to before any discount. Service charge and delivery fees are not sales.',
    formula: 'Order total − service charge − delivery fee + food discounts',
  },
  discounts: {
    term: 'Discounts',
    definition: 'Vouchers, promos, senior, PWD and manual discounts given on food. A delivery discount lowers the delivery fee instead.',
  },
  net: {
    term: 'Net sales',
    definition: 'Your sales after discounts, without service charge or delivery fees. Cancelled and voided orders are left out.',
    formula: 'Gross sales − discounts',
  },
  service: {
    term: 'Service charge',
    definition: 'Service charge added to bills. It belongs to your staff, so it is never counted as sales.',
  },
  delivery: {
    term: 'Delivery fees',
    definition: 'Delivery fees charged to customers, after any delivery discount.',
  },
  billed: {
    term: 'Total billed',
    definition: 'Everything customers were asked to pay: net sales plus service charge and delivery fees.',
    formula: 'Net sales + service charge + delivery fees',
  },
  collected: {
    term: 'Collected',
    definition:
      'Money actually received for these orders. An order marked paid, or handed over and not on a table tab, counts as paid in full.',
    formula: 'Payments received − change handed back',
  },
  unpaid: {
    term: 'Unpaid',
    definition: 'Billed but not yet received, order by order.',
    formula: 'Total billed − collected (per order, never below zero)',
  },
  overpaid: {
    term: 'Overpaid',
    definition: 'Money received beyond what an order owed. It is owed back, not extra sales.',
  },
  orders: {
    term: 'Orders',
    definition: 'Orders placed in this period, without cancelled, voided or refunded ones.',
  },
  aov: {
    term: 'Average order',
    definition: 'Net sales per order.',
    formula: 'Net sales ÷ orders',
  },
  voids: {
    term: 'Cancelled & voided',
    definition: 'Orders cancelled, voided or refunded in full. They are kept out of every other figure here.',
  },
  item_net: {
    term: 'Net sales (dish)',
    definition:
      'What a dish sold for after its share of each order’s discount. The dishes add up exactly to the store’s net sales.',
    formula: 'Line total − its share of the order discount',
  },
}
