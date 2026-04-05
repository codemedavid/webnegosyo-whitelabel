# Web Admin Orders Management — Convex-Only Rebuild

## Overview

Replace the minimal `ConvexOrdersWrapper` with a full-featured order management system matching the mobile merchant app (`webnegosyo-app/`). All data flows through Convex. Tenants without a `convex_deployment_url` see a setup prompt with the existing Supabase `RealtimeOrdersWrapper` as fallback.

## UI Structure

Single page at `/[tenant]/admin/orders` with 4 tabs:

### Tab 1: Orders

**Filter bar:** Horizontal status pills — All | Pending | Confirmed | Preparing | Ready | Delivered | Cancelled. Active pill highlighted. Uses `orders:getOrders(status, limit)`.

**Order cards:** Each card shows:
- Customer name, contact
- Order total (PHP), item count
- Status badge (color-coded)
- Order type badge, source badge (web/app)
- Relative timestamp

**Slide-out sheet (right panel):** Opens on card click. Contains:
- **Status stepper** — visual progression: Pending → Confirmed → Preparing → Ready → Delivered. Current step highlighted, completed steps checked.
- **Quick action button** — single prominent button for next logical status (e.g. "Mark as Confirmed"). Cancel button as destructive secondary action.
- **Customer section** — name, contact, custom form fields
- **Items section** — name, quantity, variation selections, addons, special instructions, bundle grouping, subtotals
- **Delivery section** (conditional) — address, delivery fee, Lalamove status/driver/tracking
- **Payment section** — method, status, details

Status updates call `orders:updateOrderStatus` mutation.

### Tab 2: Dashboard

**Period selector:** Today | Yesterday | This Week | This Month | This Year. "Today" uses `getDashboardStats()`, others use `getDashboardStatsByPeriod(startDate, endDate)`.

**Stat cards (4):**
- Total Orders
- Revenue (PHP)
- Avg Order Value (PHP)
- Active Orders (pending + confirmed + preparing + ready)

**Real-time queue:** Color-coded boxes showing count per active status. Uses `getRealtimeQueue()`. Boxes: Pending (orange), Confirmed (blue), Preparing (yellow), Ready (green).

**Recent pending orders:** Top 5 pending orders, clickable to open sheet.

### Tab 3: Analytics

**Period selector:** 7 | 14 | 30 days.

**Sections:**
1. **Sales overview** — total revenue with growth indicator (% change vs previous period), total orders, avg order value, cancelled orders + cancellation rate, orders by source (web vs app). Uses `getSalesAnalytics(daysBack)`.
2. **Payment methods** — bar chart showing revenue per method with percentage. Uses `getPaymentMethodAnalytics(daysBack)`.
3. **Peak hours heatmap** — 7-day x time-slot grid with color intensity. Peak hour annotation. Uses `getOrderHeatmap(daysBack)`.
4. **Customer insights** — total/new/returning customers, return rate, avg orders and revenue per customer, top 10 customers table. Uses `getCustomerInsights(daysBack)`.
5. **Upsell funnel** — Shown → Clicked → Converted with rates. Uses `getUpsellAnalytics(daysBack)`.
6. **Bundle performance** — Viewed → Added with conversion rate. Uses `getBundleAnalytics(daysBack)`.
7. **Top items** — ranked list with revenue bars. Uses `getTopItems(daysBack)`.

Charts use Shadcn charts (built on Recharts).

### Tab 4: Trends

**Period selector:** 7 | 14 | 30 days.

**Sections:**
1. **Daily revenue** — bar chart. Uses `getTrends(daysBack)`.
2. **Daily orders** — bar chart. Same data source.
3. **Avg order value** — line/bar chart. Same data source.
4. **Orders by source** — web vs app breakdown. Uses `getSalesAnalytics(daysBack)`.
5. **Payment method trends** — daily stacked bars. Uses `getPaymentMethodAnalytics(daysBack)`.
6. **Cancellation summary** — count, lost revenue, rate. Uses `getSalesAnalytics(daysBack)`.

## Data Flow

```
orders/page.tsx
  ├─ Has convex_deployment_url?
  │   ├─ YES → ConvexOrdersWrapper (wraps ConvexProvider)
  │   │         └─ Tabs
  │   │              ├─ ConvexOrdersTab
  │   │              │    └─ ConvexOrderSheet (slide-out)
  │   │              ├─ ConvexDashboardTab
  │   │              ├─ ConvexAnalyticsTab
  │   │              └─ ConvexTrendsTab
  │   └─ NO → "Setup required" card + RealtimeOrdersWrapper (Supabase fallback)
```

## Convex Queries Used

All queries already exist in `convex-template/convex/`:

| Query | Used In |
|-------|---------|
| `orders:getOrders(status?, limit?)` | Orders tab |
| `orders:getOrderById(orderId)` | Order sheet |
| `orders:updateOrderStatus(orderId, status)` | Order sheet |
| `orders:getDashboardStats()` | Dashboard tab (Today) |
| `orders:getDashboardStatsByPeriod(start, end)` | Dashboard tab (other periods) |
| `orders:getRealtimeQueue()` | Dashboard tab |
| `analytics:getSalesAnalytics(daysBack?)` | Analytics + Trends tabs |
| `analytics:getPaymentMethodAnalytics(daysBack?)` | Analytics + Trends tabs |
| `analytics:getOrderHeatmap(daysBack?)` | Analytics tab |
| `analytics:getCustomerInsights(daysBack?)` | Analytics tab |
| `analytics:getUpsellAnalytics(daysBack?)` | Analytics tab |
| `analytics:getBundleAnalytics(daysBack?)` | Analytics tab |
| `analytics:getTopItems(daysBack?)` | Analytics tab |
| `analytics:getTrends(daysBack?)` | Trends tab |
| `analytics:getRevenueBreakdown(daysBack?)` | Analytics tab |
| `analytics:getUpsellTrends(daysBack?)` | Analytics tab |

## New Hooks

Add to `src/hooks/use-convex-orders.ts`:

```typescript
// Existing
useConvexOrders(status?)
useConvexOrderQueue()
useConvexDashboardStats()
useConvexOrderById(orderId)
useUpdateConvexOrderStatus()

// New analytics hooks
useConvexDashboardStatsByPeriod(startDate, endDate)
useConvexSalesAnalytics(daysBack)
useConvexPaymentMethodAnalytics(daysBack)
useConvexOrderHeatmap(daysBack)
useConvexCustomerInsights(daysBack)
useConvexUpsellAnalytics(daysBack)
useConvexBundleAnalytics(daysBack)
useConvexTopItems(daysBack)
useConvexTrends(daysBack)
useConvexRevenueBreakdown(daysBack)
useConvexUpsellTrends(daysBack)
```

## New Files

| File | Purpose |
|------|---------|
| `src/components/admin/convex-orders-tab.tsx` | Orders list with filters |
| `src/components/admin/convex-order-sheet.tsx` | Slide-out order detail panel |
| `src/components/admin/convex-dashboard-tab.tsx` | Dashboard with stats + queue |
| `src/components/admin/convex-analytics-tab.tsx` | Full analytics page |
| `src/components/admin/convex-trends-tab.tsx` | Trends charts |
| `src/components/admin/order-status-stepper.tsx` | Visual status progression |
| `src/components/admin/order-heatmap.tsx` | Peak hours heatmap grid |

## Modified Files

| File | Changes |
|------|---------|
| `src/components/admin/convex-orders-wrapper.tsx` | Full rewrite — tabs container |
| `src/hooks/use-convex-orders.ts` | Add analytics hooks |
| `src/app/[tenant]/admin/orders/page.tsx` | Add fallback message for no-Convex tenants |

## Graceful Fallback

When `convex_deployment_url` is null:
1. Show an info card: "Real-time order management requires Convex. Contact support to enable."
2. Render `RealtimeOrdersWrapper` below with existing Supabase functionality.

## Status Colors (consistent with mobile)

| Status | Color | Tailwind |
|--------|-------|----------|
| Pending | Orange | `bg-orange-100 text-orange-800` |
| Confirmed | Blue | `bg-blue-100 text-blue-800` |
| Preparing | Yellow/Amber | `bg-amber-100 text-amber-800` |
| Ready | Green | `bg-green-100 text-green-800` |
| Delivered | Purple | `bg-purple-100 text-purple-800` |
| Cancelled | Red | `bg-red-100 text-red-800` |

## Status Progression Logic

Next status mapping for quick action buttons:
- pending → confirmed
- confirmed → preparing
- preparing → ready
- ready → delivered
- delivered → (no next action)
- cancelled → (no next action)

Cancel is available on: pending, confirmed, preparing, ready.

## Out of Scope

- Receipt printing (web doesn't have Bluetooth/thermal printer access)
- Push notifications (already handled by existing notification system)
- Modifying any Convex backend queries (all needed queries exist)
- Supabase orders path changes (kept as-is for fallback)
