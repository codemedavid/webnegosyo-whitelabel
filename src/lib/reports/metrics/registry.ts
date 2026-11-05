/**
 * The metric registry (plan 2026-11-05 §5.1): one entry per number an owner
 * can put on a card, a table column or an export. Cards, columns, ⓘ sheets,
 * export headers and the app all read their words and rules from here, so a
 * number is never named or explained two ways. The app does not import this
 * file; the report API sends the entries it needs with every answer.
 *
 * Values are computed only in `compute.ts`, from the one sales definition
 * (`sales-model.ts` + SQL twins) and the profit model (`profit-model.ts`).
 * Money is integer centavos; percentages are fractions (0.25 = 25%).
 */

import { METRIC_GLOSSARY } from '../metric-glossary'

export const METRIC_IDS = [
  'net_sales',
  'gross_sales',
  'discounts',
  'orders',
  'aov',
  'items_sold',
  'items_per_order',
  'avg_item_price',
  'avg_sales_per_day',
  'avg_orders_per_day',
  'money_received',
  'still_to_collect',
  'service_charge',
  'delivery_fees',
  'cancelled_orders',
  'share_of_sales',
  'cost_of_food',
  'gross_profit',
  'gross_margin_pct',
  'food_cost_pct',
  'expenses',
  'profit',
  'cost_coverage_pct',
] as const
export type MetricId = (typeof METRIC_IDS)[number]

export type MetricFormat = 'money' | 'count' | 'percent' | 'decimal'
/** How a totals row combines it: add, or recompute from its parts (never average a ratio). */
export type MetricAggregation = 'sum' | 'ratio'
/** Which way is good news; `none` = neither (shown in grey). */
export type MetricDirection = 'up' | 'down' | 'none'
/** The staff key that may see it. Cost figures need `costs` on top of `reports`. */
export type MetricPermission = 'reports' | 'costs'
/** Where a metric can appear: the whole period, one period row, one breakdown row. */
export type MetricScope = 'summary' | 'period' | 'breakdown'

export interface MetricDef {
  id: MetricId
  /** Owner words on cards and column headers. */
  label: string
  /** Taglish helper under the label. */
  hint: string
  /** The ⓘ sheet. */
  definition: string
  format: MetricFormat
  aggregation: MetricAggregation
  goodDirection: MetricDirection
  permission: MetricPermission
  scopes: readonly MetricScope[]
}

const ALL_SCOPES: readonly MetricScope[] = ['summary', 'period', 'breakdown']

type Entry = Omit<MetricDef, 'id'>

const glossary = (key: keyof typeof METRIC_GLOSSARY): string => METRIC_GLOSSARY[key].definition

const DEFINITIONS: Readonly<Record<MetricId, Entry>> = {
  net_sales: {
    label: 'Sales',
    hint: 'Benta matapos ang discount',
    definition: glossary('net'),
    format: 'money',
    aggregation: 'sum',
    goodDirection: 'up',
    permission: 'reports',
    scopes: ALL_SCOPES,
  },
  gross_sales: {
    label: 'Sales before discounts',
    hint: 'Benta bago ang discount',
    definition: glossary('gross'),
    format: 'money',
    aggregation: 'sum',
    goodDirection: 'up',
    permission: 'reports',
    scopes: ALL_SCOPES,
  },
  discounts: {
    label: 'Discounts',
    hint: 'Mga binawas sa presyo',
    definition: glossary('discounts'),
    format: 'money',
    aggregation: 'sum',
    goodDirection: 'none',
    permission: 'reports',
    scopes: ALL_SCOPES,
  },
  orders: {
    label: 'Orders',
    hint: 'Ilang order',
    definition: glossary('orders'),
    format: 'count',
    aggregation: 'sum',
    goodDirection: 'up',
    permission: 'reports',
    scopes: ALL_SCOPES,
  },
  aov: {
    label: 'Average order',
    hint: 'Average na gastos bawat order',
    definition: glossary('aov'),
    format: 'money',
    aggregation: 'ratio',
    goodDirection: 'up',
    permission: 'reports',
    scopes: ALL_SCOPES,
  },
  items_sold: {
    label: 'Items sold',
    hint: 'Ilang piraso ang nabenta',
    definition: 'Every dish and drink sold, counted by piece. Cancelled orders are left out.',
    format: 'count',
    aggregation: 'sum',
    goodDirection: 'up',
    permission: 'reports',
    scopes: ['summary', 'breakdown'],
  },
  items_per_order: {
    label: 'Items per order',
    hint: 'Ilang piraso bawat order',
    definition: 'How many pieces the average order has. Combos and add-ons working show up here first.',
    format: 'decimal',
    aggregation: 'ratio',
    goodDirection: 'up',
    permission: 'reports',
    scopes: ['summary'],
  },
  avg_item_price: {
    label: 'Average price',
    hint: 'Average na presyo bawat piraso',
    definition: 'Sales divided by pieces sold: what one piece really sold for, after discounts.',
    format: 'money',
    aggregation: 'ratio',
    goodDirection: 'none',
    permission: 'reports',
    scopes: ['summary', 'breakdown'],
  },
  avg_sales_per_day: {
    label: 'Sales per day',
    hint: 'Average na benta bawat araw',
    definition: 'Sales divided by the days in the period, so weeks and months of different length compare fairly.',
    format: 'money',
    aggregation: 'ratio',
    goodDirection: 'up',
    permission: 'reports',
    scopes: ['summary'],
  },
  avg_orders_per_day: {
    label: 'Orders per day',
    hint: 'Average na order bawat araw',
    definition: 'Orders divided by the days in the period.',
    format: 'decimal',
    aggregation: 'ratio',
    goodDirection: 'up',
    permission: 'reports',
    scopes: ['summary'],
  },
  money_received: {
    label: 'Money received',
    hint: 'Perang natanggap',
    definition: glossary('collected'),
    format: 'money',
    aggregation: 'sum',
    goodDirection: 'up',
    permission: 'reports',
    scopes: ['summary', 'period'],
  },
  still_to_collect: {
    label: 'Still to collect',
    hint: 'Hindi pa bayad',
    definition: glossary('unpaid'),
    format: 'money',
    aggregation: 'sum',
    goodDirection: 'down',
    permission: 'reports',
    scopes: ['summary'],
  },
  service_charge: {
    label: 'Service charge',
    hint: 'Para sa staff',
    definition: glossary('service'),
    format: 'money',
    aggregation: 'sum',
    goodDirection: 'none',
    permission: 'reports',
    scopes: ['summary'],
  },
  delivery_fees: {
    label: 'Delivery fees',
    hint: 'Bayad sa delivery',
    definition: glossary('delivery'),
    format: 'money',
    aggregation: 'sum',
    goodDirection: 'none',
    permission: 'reports',
    scopes: ['summary'],
  },
  cancelled_orders: {
    label: 'Cancelled orders',
    hint: 'Mga na-cancel',
    definition: glossary('voids'),
    format: 'count',
    aggregation: 'sum',
    goodDirection: 'down',
    permission: 'reports',
    scopes: ['summary'],
  },
  share_of_sales: {
    label: 'Share of sales',
    hint: 'Bahagi sa kabuuang benta',
    definition: "This row's sales as a part of the whole period's sales.",
    format: 'percent',
    aggregation: 'ratio',
    goodDirection: 'none',
    permission: 'reports',
    scopes: ['breakdown'],
  },
  cost_of_food: {
    label: 'Cost of food',
    hint: 'Gastos sa sangkap',
    definition:
      'What the ingredients cost. From your recipes at the price you paid when the dish was sold, plus waste and missing stock; without stock tracking, the ingredient purchases you recorded.',
    format: 'money',
    aggregation: 'sum',
    goodDirection: 'down',
    permission: 'costs',
    scopes: ['summary', 'period'],
  },
  gross_profit: {
    label: 'Gross profit',
    hint: 'Kita bago ang ibang gastos',
    definition: 'Sales minus the cost of food: what is left to pay staff, rent and the rest.',
    format: 'money',
    aggregation: 'sum',
    goodDirection: 'up',
    permission: 'costs',
    scopes: ['summary', 'period'],
  },
  gross_margin_pct: {
    label: 'Gross margin',
    hint: 'Ilan sa bawat ₱100 ang natitira',
    definition: 'Gross profit as a part of sales: of every ₱100 sold, how much is left after the food.',
    format: 'percent',
    aggregation: 'ratio',
    goodDirection: 'up',
    permission: 'costs',
    scopes: ['summary', 'period'],
  },
  food_cost_pct: {
    label: 'Food cost %',
    hint: 'Bahagi ng benta na napunta sa sangkap',
    definition: 'Cost of food as a part of sales. Most food businesses aim for about 28–35%.',
    format: 'percent',
    aggregation: 'ratio',
    goodDirection: 'down',
    permission: 'costs',
    scopes: ['summary', 'period'],
  },
  expenses: {
    label: 'Expenses',
    hint: 'Ibang gastos',
    definition: 'Staff, rent, utilities and every other expense you recorded, except ingredients and equipment.',
    format: 'money',
    aggregation: 'sum',
    goodDirection: 'down',
    permission: 'costs',
    scopes: ['summary', 'period'],
  },
  profit: {
    label: 'Profit',
    hint: 'Kita',
    definition: 'Sales minus the cost of food and your expenses. Only as complete as the costs and expenses you record.',
    format: 'money',
    aggregation: 'sum',
    goodDirection: 'up',
    permission: 'costs',
    scopes: ['summary', 'period'],
  },
  cost_coverage_pct: {
    label: 'Dishes with a cost',
    hint: 'Ilan ang may recipe o cost',
    definition: 'Of the pieces sold, how many had a recipe or a cost. Below 90%, cost of food and profit are estimates.',
    format: 'percent',
    aggregation: 'ratio',
    goodDirection: 'up',
    permission: 'costs',
    scopes: ['summary'],
  },
}

export const METRICS: Readonly<Record<MetricId, MetricDef>> = Object.fromEntries(
  METRIC_IDS.map((id) => [id, { id, ...DEFINITIONS[id] }]),
) as Record<MetricId, MetricDef>

export function isMetricId(value: unknown): value is MetricId {
  return typeof value === 'string' && (METRIC_IDS as readonly string[]).includes(value)
}

/** The metrics a caller may see: cost figures need the `costs` key. */
export function visibleMetrics(canSeeCosts: boolean): MetricDef[] {
  return METRIC_IDS.map((id) => METRICS[id]).filter((metric) => canSeeCosts || metric.permission !== 'costs')
}

/** The Overview's cards before an owner picks their own (plan §6.1). */
export const DEFAULT_OVERVIEW_METRICS: readonly MetricId[] = [
  'net_sales',
  'orders',
  'aov',
  'avg_orders_per_day',
  'gross_margin_pct',
  'items_sold',
]

/** The same cards for an account without cost access. */
export const DEFAULT_OVERVIEW_METRICS_NO_COSTS: readonly MetricId[] = [
  'net_sales',
  'orders',
  'aov',
  'avg_orders_per_day',
  'money_received',
  'items_sold',
]
