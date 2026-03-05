# Advanced Sales Analytics for WebnNegosyo Merchant App

**Date:** 2026-03-05
**Status:** Approved

## Overview

Add comprehensive sales, payment, operational, and customer analytics to the webnegosyo-app merchant admin. Enhances existing Analytics and Trends screens with new sections — no new tabs or navigation changes.

## Approach

**Approach A: New Convex Queries Only** — add server-side queries that compute analytics from existing `orders` + `orderItems` data. No schema changes. All charts custom-built with React Native Views (matching existing pattern).

## New Convex Queries

All queries added to `convex-template/convex/analytics.ts`.

### `getSalesAnalytics(daysBack: number)`

Returns:
- `totalRevenue`, `totalOrders`, `avgOrderValue`
- `cancelledOrders`, `cancelledRevenue`, `cancellationRate`
- `completedOrders`, `completionRate`
- `ordersBySource`: `{ web: number, mobile: number }`
- `ordersByStatus`: `{ pending, confirmed, preparing, ready, delivered, cancelled }`
- `revenueGrowth`: percentage change vs previous period

### `getPaymentMethodAnalytics(daysBack: number)`

Returns:
- `methods[]`: `{ method, count, revenue, percentage, avgOrderValue }`
- `dailyBreakdown[]`: `{ date, methods: { [method]: revenue } }` (for trend lines)

### `getOrderHeatmap(daysBack: number)`

Returns:
- `heatmap`: 7x24 matrix `{ day: 0-6, hour: 0-23, count: number }`
- `peakHour`: `{ day, hour, count }`
- `quietHour`: `{ day, hour, count }`

### `getCustomerInsights(daysBack: number)`

Returns:
- `totalCustomers`, `newCustomers`, `returningCustomers`, `returnRate`
- `avgOrdersPerCustomer`, `avgRevenuePerCustomer`
- `topCustomers[]`: `{ name, contact, orderCount, totalSpent, lastOrderDate }` (top 10)

## Enhanced Analytics Screen

New sections added above existing upsell/bundle sections:

1. **Sales Overview** — StatCards: Revenue (with growth %), Orders, AOV, Cancelled Orders, Cancellation Rate
2. **Payment Methods** — Horizontal bar chart: each method shows bar + percentage + revenue + count
3. **Peak Hours Heatmap** — 7-day x time-slot grid with color intensity = order volume. Shows peak/quiet annotations.
4. **Customer Insights** — StatCards: Total Customers, New, Returning, Return Rate, Avg Orders/Customer
5. **Top Customers** — Ranked list: name, order count, total spent

Existing sections (Upsell Funnel, Bundle Performance, Revenue Breakdown, Top Items) remain below.

## Enhanced Trends Screen

New chart sections added below existing daily charts:

1. **Orders by Source** — Daily bars split by web vs mobile
2. **Payment Trends** — Stacked bar chart showing payment method mix per day
3. **Cancellation Trend** — Daily cancelled order count bars

Existing sections (Daily Revenue, Daily Orders, Avg Order Value, Summary) remain.

## Technical Details

- All charts custom-built with React Native `View` components (no new dependencies)
- Heatmap: grid of View boxes with backgroundColor opacity mapped to order count
- Stacked bars: multiple View children inside a flex row, width proportional to value
- Queries use `useSafeQuery` hook with graceful degradation
- Customer matching: group by `customerContact` (lowercased + trimmed)
- Period selector: reuse existing `PeriodSelector` component (7/14/30 days)
- No schema changes to Convex — all computed from existing `orders` + `orderItems` tables

## Out of Scope

- Cancellation reason tracking (would require schema change)
- Export/download analytics
- Push notifications for analytics thresholds
- Real-time streaming analytics
