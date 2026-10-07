/**
 * One colour and one icon per metric, shared by the tiles, the chart line and
 * the "Who's buying" rows so a colour always means the same thing.
 */

import type { MetricKey } from './dashboard-metrics'

export interface MetricStyle {
  /** Chart line and tile accent. */
  color: string
  /** Icon chip background. */
  wash: string
  /** Icon colour on the wash (≥4.5:1). */
  ink: string
}

export const METRIC_STYLES: Readonly<Record<MetricKey, MetricStyle>> = {
  newCustomers: { color: '#E4572E', wash: '#FBEAE3', ink: '#B23E1B' },
  returningCustomers: { color: '#1D1815', wash: '#ECE8E1', ink: '#1D1815' },
  sales: { color: '#0F8A5F', wash: '#E2F3EB', ink: '#0B6B4A' },
  orders: { color: '#D97706', wash: '#FDF0DC', ink: '#9A4A06' },
  avgOrder: { color: '#5B54C9', wash: '#ECEBFA', ink: '#3F399E' },
}

/** Walk-ins (orders with no phone number) — warm grey, never a metric of their own. */
export const WALK_IN_STYLE: MetricStyle = { color: '#C9C1B4', wash: '#F1EEE8', ink: '#5E574D' }
