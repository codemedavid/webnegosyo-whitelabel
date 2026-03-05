# Advanced Sales Analytics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add comprehensive sales, payment, operational, and customer analytics to the existing Analytics and Trends screens in the webnegosyo-app merchant admin.

**Architecture:** 4 new Convex queries compute analytics from existing `orders` + `orderItems` data (no schema changes). New sections are added to the existing Analytics (`analytics.tsx`) and Trends (`trends.tsx`) screens. All visualizations are custom-built with React Native `View` components, matching the existing pattern.

**Tech Stack:** Convex (server queries), React Native, TypeScript, existing `useSafeQuery` hook

---

## Task 1: Add `getSalesAnalytics` Convex Query

**Files:**
- Modify: `convex-template/convex/analytics.ts` (append after line 270)

**Step 1: Add the query**

Append to `convex-template/convex/analytics.ts` after line 270:

```typescript
export const getSalesAnalytics = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.daysBack ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const prevCutoff = cutoff - days * 24 * 60 * 60 * 1000;

    // Current period orders
    const currentOrders = await ctx.db
      .query("orders")
      .filter((q) => q.gte(q.field("_creationTime"), cutoff))
      .order("desc")
      .take(QUERY_LIMIT);

    // Previous period orders (for growth comparison)
    const prevOrders = await ctx.db
      .query("orders")
      .filter((q) =>
        q.and(
          q.gte(q.field("_creationTime"), prevCutoff),
          q.lt(q.field("_creationTime"), cutoff)
        )
      )
      .order("desc")
      .take(QUERY_LIMIT);

    const completed = currentOrders.filter((o) => o.status !== "cancelled");
    const cancelled = currentOrders.filter((o) => o.status === "cancelled");
    const prevCompleted = prevOrders.filter((o) => o.status !== "cancelled");

    const totalRevenue = completed.reduce((sum, o) => sum + o.total, 0);
    const prevRevenue = prevCompleted.reduce((sum, o) => sum + o.total, 0);
    const cancelledRevenue = cancelled.reduce((sum, o) => sum + o.total, 0);

    const webOrders = currentOrders.filter((o) => o.source === "web").length;
    const mobileOrders = currentOrders.filter((o) => o.source === "mobile").length;

    const statusCounts: Record<string, number> = {};
    for (const order of currentOrders) {
      statusCounts[order.status] = (statusCounts[order.status] ?? 0) + 1;
    }

    return {
      totalRevenue,
      totalOrders: currentOrders.length,
      completedOrders: completed.length,
      avgOrderValue: completed.length > 0 ? totalRevenue / completed.length : 0,
      cancelledOrders: cancelled.length,
      cancelledRevenue,
      cancellationRate: currentOrders.length > 0 ? cancelled.length / currentOrders.length : 0,
      ordersBySource: { web: webOrders, mobile: mobileOrders },
      ordersByStatus: statusCounts,
      revenueGrowth: prevRevenue > 0 ? (totalRevenue - prevRevenue) / prevRevenue : 0,
    };
  },
});
```

**Step 2: Verify the query compiles**

Run: `cd convex-template && npx convex typecheck` (or just verify no TS errors in editor)

**Step 3: Commit**

```bash
git add convex-template/convex/analytics.ts
git commit -m "feat(analytics): add getSalesAnalytics Convex query

Computes sales overview metrics from existing orders data:
revenue, order counts, cancellation rate, source split, growth %"
```

---

## Task 2: Add `getPaymentMethodAnalytics` Convex Query

**Files:**
- Modify: `convex-template/convex/analytics.ts` (append after Task 1's code)

**Step 1: Add the query**

Append to `convex-template/convex/analytics.ts`:

```typescript
export const getPaymentMethodAnalytics = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.daysBack ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const orders = await ctx.db
      .query("orders")
      .filter((q) =>
        q.and(
          q.gte(q.field("_creationTime"), cutoff),
          q.neq(q.field("status"), "cancelled")
        )
      )
      .order("desc")
      .take(QUERY_LIMIT);

    // Aggregate by payment method
    const methodMap = new Map<string, { count: number; revenue: number; totalOrderValue: number }>();
    for (const order of orders) {
      const method = order.paymentMethod ?? "Unknown";
      const existing = methodMap.get(method) ?? { count: 0, revenue: 0, totalOrderValue: 0 };
      existing.count += 1;
      existing.revenue += order.total;
      existing.totalOrderValue += order.total;
      methodMap.set(method, existing);
    }

    const totalOrders = orders.length;
    const methods = Array.from(methodMap.entries())
      .map(([method, data]) => ({
        method,
        count: data.count,
        revenue: data.revenue,
        percentage: totalOrders > 0 ? data.count / totalOrders : 0,
        avgOrderValue: data.count > 0 ? data.totalOrderValue / data.count : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // Daily breakdown for trend lines
    const dailyMap = new Map<string, Map<string, number>>();
    for (const order of orders) {
      const date = new Date(order._creationTime).toISOString().split("T")[0];
      const method = order.paymentMethod ?? "Unknown";
      if (!dailyMap.has(date)) dailyMap.set(date, new Map());
      const dayMethods = dailyMap.get(date)!;
      dayMethods.set(method, (dayMethods.get(method) ?? 0) + order.total);
    }

    const dailyBreakdown = Array.from(dailyMap.entries())
      .map(([date, methodRevenues]) => ({
        date,
        methods: Object.fromEntries(methodRevenues),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { methods, dailyBreakdown };
  },
});
```

**Step 2: Commit**

```bash
git add convex-template/convex/analytics.ts
git commit -m "feat(analytics): add getPaymentMethodAnalytics Convex query

Aggregates payment method distribution with per-method stats
and daily breakdown for trend visualization"
```

---

## Task 3: Add `getOrderHeatmap` Convex Query

**Files:**
- Modify: `convex-template/convex/analytics.ts` (append)

**Step 1: Add the query**

```typescript
export const getOrderHeatmap = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.daysBack ?? 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const orders = await ctx.db
      .query("orders")
      .filter((q) =>
        q.and(
          q.gte(q.field("_creationTime"), cutoff),
          q.neq(q.field("status"), "cancelled")
        )
      )
      .order("desc")
      .take(QUERY_LIMIT);

    // Build 7x24 heatmap (day 0=Sun, 1=Mon, ..., 6=Sat)
    const grid: { day: number; hour: number; count: number }[] = [];
    const countMap = new Map<string, number>();

    for (const order of orders) {
      const d = new Date(order._creationTime);
      const key = `${d.getDay()}-${d.getHours()}`;
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    }

    let peakHour = { day: 0, hour: 0, count: 0 };
    let quietHour = { day: 0, hour: 0, count: Infinity };

    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const count = countMap.get(`${day}-${hour}`) ?? 0;
        grid.push({ day, hour, count });
        if (count > peakHour.count) peakHour = { day, hour, count };
        if (count < quietHour.count) quietHour = { day, hour, count };
      }
    }

    // Fix quietHour if no orders at all
    if (quietHour.count === Infinity) quietHour = { day: 0, hour: 0, count: 0 };

    return { heatmap: grid, peakHour, quietHour };
  },
});
```

**Step 2: Commit**

```bash
git add convex-template/convex/analytics.ts
git commit -m "feat(analytics): add getOrderHeatmap Convex query

Builds 7x24 day-hour grid from order timestamps for
peak hours visualization, with peak/quiet annotations"
```

---

## Task 4: Add `getCustomerInsights` Convex Query

**Files:**
- Modify: `convex-template/convex/analytics.ts` (append)

**Step 1: Add the query**

```typescript
export const getCustomerInsights = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.daysBack ?? 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const orders = await ctx.db
      .query("orders")
      .filter((q) =>
        q.and(
          q.gte(q.field("_creationTime"), cutoff),
          q.neq(q.field("status"), "cancelled")
        )
      )
      .order("desc")
      .take(QUERY_LIMIT);

    // Group by customerContact (lowercased + trimmed)
    const customerMap = new Map<string, {
      name: string;
      orderCount: number;
      totalSpent: number;
      lastOrderDate: number;
    }>();

    for (const order of orders) {
      const key = order.customerContact.toLowerCase().trim();
      const existing = customerMap.get(key);
      if (existing) {
        existing.orderCount += 1;
        existing.totalSpent += order.total;
        existing.lastOrderDate = Math.max(existing.lastOrderDate, order._creationTime);
      } else {
        customerMap.set(key, {
          name: order.customerName,
          orderCount: 1,
          totalSpent: order.total,
          lastOrderDate: order._creationTime,
        });
      }
    }

    const customers = Array.from(customerMap.values());
    const totalCustomers = customers.length;
    const returningCustomers = customers.filter((c) => c.orderCount > 1).length;
    const newCustomers = totalCustomers - returningCustomers;

    const topCustomers = customers
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10)
      .map((c) => ({
        name: c.name,
        contact: "",  // omit contact for privacy in display
        orderCount: c.orderCount,
        totalSpent: c.totalSpent,
        lastOrderDate: c.lastOrderDate,
      }));

    return {
      totalCustomers,
      newCustomers,
      returningCustomers,
      returnRate: totalCustomers > 0 ? returningCustomers / totalCustomers : 0,
      avgOrdersPerCustomer: totalCustomers > 0 ? orders.length / totalCustomers : 0,
      avgRevenuePerCustomer: totalCustomers > 0
        ? orders.reduce((s, o) => s + o.total, 0) / totalCustomers
        : 0,
      topCustomers,
    };
  },
});
```

**Step 2: Commit**

```bash
git add convex-template/convex/analytics.ts
git commit -m "feat(analytics): add getCustomerInsights Convex query

Groups orders by customerContact to compute repeat vs new
customers, return rate, top 10 customers by spend"
```

---

## Task 5: Create `HeatmapGrid` Component

**Files:**
- Create: `webnegosyo-app/components/HeatmapGrid.tsx`

**Step 1: Create the component**

```typescript
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, typography, spacing } from "../theme/colors";

interface HeatmapGridProps {
  heatmap: { day: number; hour: number; count: number }[];
  peakHour: { day: number; hour: number; count: number };
  quietHour: { day: number; hour: number; count: number };
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Show 6 time slots (4-hour blocks) to keep it compact
const HOUR_SLOTS = [
  { label: "6am", start: 6, end: 9 },
  { label: "10am", start: 10, end: 13 },
  { label: "2pm", start: 14, end: 17 },
  { label: "6pm", start: 18, end: 21 },
  { label: "10pm", start: 22, end: 1 },
];

export function HeatmapGrid({ heatmap, peakHour, quietHour }: HeatmapGridProps) {
  // Aggregate into 4-hour slots per day
  const slotData: { day: number; slotIndex: number; count: number }[] = [];
  const maxCount = Math.max(...heatmap.map((h) => h.count), 1);

  for (let day = 0; day < 7; day++) {
    for (let si = 0; si < HOUR_SLOTS.length; si++) {
      const slot = HOUR_SLOTS[si];
      let count = 0;
      for (let h = slot.start; h <= slot.end; h++) {
        const hourNorm = h % 24;
        const cell = heatmap.find((c) => c.day === day && c.hour === hourNorm);
        count += cell?.count ?? 0;
      }
      slotData.push({ day, slotIndex: si, count });
    }
  }

  const slotMax = Math.max(...slotData.map((s) => s.count), 1);

  return (
    <View>
      {/* Header row */}
      <View style={styles.row}>
        <View style={styles.labelCell} />
        {DAY_LABELS.map((d) => (
          <View key={d} style={styles.headerCell}>
            <Text style={styles.headerText}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Data rows */}
      {HOUR_SLOTS.map((slot, si) => (
        <View key={slot.label} style={styles.row}>
          <View style={styles.labelCell}>
            <Text style={styles.labelText}>{slot.label}</Text>
          </View>
          {DAY_LABELS.map((_, day) => {
            const cell = slotData.find((s) => s.day === day && s.slotIndex === si);
            const count = cell?.count ?? 0;
            const intensity = slotMax > 0 ? count / slotMax : 0;
            return (
              <View
                key={`${day}-${si}`}
                style={[
                  styles.cell,
                  {
                    backgroundColor: intensity === 0
                      ? colors.separator
                      : `rgba(99, 102, 241, ${0.15 + intensity * 0.85})`,
                  },
                ]}
              >
                {count > 0 && (
                  <Text style={[styles.cellText, intensity > 0.5 && styles.cellTextLight]}>
                    {count}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      ))}

      {/* Peak annotation */}
      <View style={styles.annotationRow}>
        <Text style={styles.annotationText}>
          Peak: {DAY_LABELS[peakHour.day]} {formatHour(peakHour.hour)} ({peakHour.count} orders)
        </Text>
      </View>
    </View>
  );
}

function formatHour(hour: number): string {
  if (hour === 0) return "12am";
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return "12pm";
  return `${hour - 12}pm`;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 2, marginBottom: 2 },
  labelCell: { width: 36, justifyContent: "center" },
  labelText: { ...typography.small, color: colors.textTertiary },
  headerCell: { flex: 1, alignItems: "center", paddingBottom: spacing.xs },
  headerText: { ...typography.small, color: colors.textTertiary, fontWeight: "500" },
  cell: {
    flex: 1,
    aspectRatio: 1.4,
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  cellText: { fontSize: 8, fontWeight: "600", color: colors.textSecondary },
  cellTextLight: { color: "#FFFFFF" },
  annotationRow: { marginTop: spacing.sm, alignItems: "center" },
  annotationText: { ...typography.caption, color: colors.textSecondary, fontWeight: "500" },
});
```

**Step 2: Commit**

```bash
git add webnegosyo-app/components/HeatmapGrid.tsx
git commit -m "feat(analytics): add HeatmapGrid component

7-day x 5-slot heatmap visualization for peak hours.
Aggregates hourly data into 4-hour blocks with color
intensity and peak annotation."
```

---

## Task 6: Create `GrowthIndicator` Component

**Files:**
- Create: `webnegosyo-app/components/GrowthIndicator.tsx`

**Step 1: Create the component**

A small inline component that shows +12% or -5% with color.

```typescript
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, typography, spacing } from "../theme/colors";

interface GrowthIndicatorProps {
  value: number; // decimal, e.g. 0.12 = 12%
}

export function GrowthIndicator({ value }: GrowthIndicatorProps) {
  const isPositive = value >= 0;
  const pct = (Math.abs(value) * 100).toFixed(1);
  const arrow = isPositive ? "\u2191" : "\u2193";
  const color = isPositive ? colors.success : colors.danger;

  return (
    <View style={[styles.container, { backgroundColor: isPositive ? colors.statusReady + "20" : colors.statusCancelled + "20" }]}>
      <Text style={[styles.text, { color }]}>
        {arrow} {pct}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  text: {
    ...typography.small,
    fontWeight: "700",
  },
});
```

**Step 2: Commit**

```bash
git add webnegosyo-app/components/GrowthIndicator.tsx
git commit -m "feat(analytics): add GrowthIndicator component

Shows percentage change with colored arrow (green up, red down)"
```

---

## Task 7: Enhance Analytics Screen — Sales Overview Section

**Files:**
- Modify: `webnegosyo-app/app/(main)/analytics.tsx`

**Step 1: Add imports, refs, and interfaces at the top**

After line 15, add new query ref:
```typescript
const getSalesAnalyticsRef = "analytics:getSalesAnalytics" as unknown as FunctionReference<"query">;
const getCustomerInsightsRef = "analytics:getCustomerInsights" as unknown as FunctionReference<"query">;
const getOrderHeatmapRef = "analytics:getOrderHeatmap" as unknown as FunctionReference<"query">;
const getPaymentMethodAnalyticsRef = "analytics:getPaymentMethodAnalytics" as unknown as FunctionReference<"query">;
```

After line 27, add new interfaces:
```typescript
interface SalesAnalytics {
  totalRevenue: number;
  totalOrders: number;
  completedOrders: number;
  avgOrderValue: number;
  cancelledOrders: number;
  cancelledRevenue: number;
  cancellationRate: number;
  ordersBySource: { web: number; mobile: number };
  ordersByStatus: Record<string, number>;
  revenueGrowth: number;
}

interface PaymentMethodAnalytics {
  methods: { method: string; count: number; revenue: number; percentage: number; avgOrderValue: number }[];
  dailyBreakdown: { date: string; methods: Record<string, number> }[];
}

interface OrderHeatmap {
  heatmap: { day: number; hour: number; count: number }[];
  peakHour: { day: number; hour: number; count: number };
  quietHour: { day: number; hour: number; count: number };
}

interface CustomerInsights {
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  returnRate: number;
  avgOrdersPerCustomer: number;
  avgRevenuePerCustomer: number;
  topCustomers: { name: string; contact: string; orderCount: number; totalSpent: number; lastOrderDate: number }[];
}
```

Add imports for new components:
```typescript
import { StatCard } from "../../components/StatCard";
import { HeatmapGrid } from "../../components/HeatmapGrid";
import { GrowthIndicator } from "../../components/GrowthIndicator";
```

**Step 2: Add new query hooks inside the component**

After the existing hooks (line 44), add:
```typescript
const { data: salesAnalytics, error: salesError } = useSafeQuery<SalesAnalytics>(getSalesAnalyticsRef, { daysBack });
const { data: paymentAnalytics, error: paymentError } = useSafeQuery<PaymentMethodAnalytics>(getPaymentMethodAnalyticsRef, { daysBack });
const { data: heatmapData, error: heatmapError } = useSafeQuery<OrderHeatmap>(getOrderHeatmapRef, { daysBack });
const { data: customerInsights, error: customerError } = useSafeQuery<CustomerInsights>(getCustomerInsightsRef, { daysBack });
```

Update error aggregation (line 46):
```typescript
const error = upsellError || bundleError || topItemsError || revenueError || trendsError || salesError || paymentError || heatmapError || customerError;
```

**Step 3: Add Sales Overview section before the existing Upsell Funnel card**

Insert before the `{/* Upsell Funnel */}` comment (line 67):

```tsx
{/* Sales Overview */}
<Card title="Sales Overview" style={styles.section}>
  {!salesAnalytics ? (
    <LoadingState />
  ) : (
    <>
      <View style={styles.salesHeadline}>
        <Text style={styles.headlineValue}>₱{salesAnalytics.totalRevenue.toFixed(0)}</Text>
        <GrowthIndicator value={salesAnalytics.revenueGrowth} />
      </View>
      <View style={styles.metricsRow}>
        <StatCard value={salesAnalytics.totalOrders} label="Orders" />
        <StatCard value={`₱${salesAnalytics.avgOrderValue.toFixed(0)}`} label="Avg Order" />
      </View>
      <View style={styles.metricsRow}>
        <StatCard value={salesAnalytics.cancelledOrders} label="Cancelled" />
        <StatCard value={`${(salesAnalytics.cancellationRate * 100).toFixed(1)}%`} label="Cancel Rate" />
      </View>
      <View style={[styles.sourceRow, { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 0.5, borderTopColor: colors.separator }]}>
        <View style={styles.sourceItem}>
          <Text style={styles.sourceValue}>{salesAnalytics.ordersBySource.web}</Text>
          <Text style={styles.sourceLabel}>Web</Text>
        </View>
        <View style={styles.sourceDivider} />
        <View style={styles.sourceItem}>
          <Text style={styles.sourceValue}>{salesAnalytics.ordersBySource.mobile}</Text>
          <Text style={styles.sourceLabel}>Mobile</Text>
        </View>
      </View>
    </>
  )}
</Card>
```

**Step 4: Add Payment Methods section**

Insert after Sales Overview card:

```tsx
{/* Payment Methods — Enhanced */}
<Card title="Payment Methods" style={styles.section}>
  {!paymentAnalytics ? (
    <LoadingState />
  ) : paymentAnalytics.methods.length === 0 ? (
    <EmptyState message="No payment data yet" />
  ) : (
    <>
      {paymentAnalytics.methods.map((m, i) => {
        const maxRevenue = paymentAnalytics.methods[0]?.revenue ?? 1;
        const barWidthPct = Math.max((m.revenue / maxRevenue) * 100, 8);
        const color = BAR_COLORS[i % BAR_COLORS.length];
        return (
          <View key={m.method} style={styles.paymentRow}>
            <View style={styles.paymentHeader}>
              <View style={[styles.paymentDot, { backgroundColor: color }]} />
              <Text style={styles.paymentLabel}>{m.method}</Text>
              <Text style={styles.paymentPct}>{(m.percentage * 100).toFixed(0)}%</Text>
            </View>
            <View style={breakdownStyles.barTrack}>
              <View style={[breakdownStyles.barFill, { width: `${barWidthPct}%`, backgroundColor: color }]} />
            </View>
            <View style={styles.paymentMeta}>
              <Text style={styles.paymentMetaText}>₱{m.revenue.toFixed(0)} · {m.count} orders · avg ₱{m.avgOrderValue.toFixed(0)}</Text>
            </View>
          </View>
        );
      })}
    </>
  )}
</Card>
```

**Step 5: Add Peak Hours Heatmap section**

```tsx
{/* Peak Hours */}
<Card title="Peak Hours" style={styles.section}>
  {!heatmapData ? (
    <LoadingState />
  ) : (
    <HeatmapGrid
      heatmap={heatmapData.heatmap}
      peakHour={heatmapData.peakHour}
      quietHour={heatmapData.quietHour}
    />
  )}
</Card>
```

**Step 6: Add Customer Insights section**

```tsx
{/* Customer Insights */}
<Card title="Customer Insights" style={styles.section}>
  {!customerInsights ? (
    <LoadingState />
  ) : (
    <>
      <View style={styles.metricsRow}>
        <StatCard value={customerInsights.totalCustomers} label="Total" />
        <StatCard value={customerInsights.newCustomers} label="New" />
        <StatCard value={customerInsights.returningCustomers} label="Returning" />
      </View>
      <View style={styles.metricsRow}>
        <StatCard value={`${(customerInsights.returnRate * 100).toFixed(0)}%`} label="Return Rate" />
        <StatCard value={customerInsights.avgOrdersPerCustomer.toFixed(1)} label="Avg Orders" />
        <StatCard value={`₱${customerInsights.avgRevenuePerCustomer.toFixed(0)}`} label="Avg Spend" />
      </View>

      {customerInsights.topCustomers.length > 0 && (
        <View style={{ marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 0.5, borderTopColor: colors.separator }}>
          <Text style={styles.trendTitle}>Top Customers</Text>
          {customerInsights.topCustomers.map((c, i) => (
            <View key={i} style={styles.customerRow}>
              <Text style={styles.rankText}>#{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.customerName}>{c.name}</Text>
                <Text style={styles.customerMeta}>{c.orderCount} orders · ₱{c.totalSpent.toFixed(0)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </>
  )}
</Card>
```

**Step 7: Add new styles**

Append to the `styles` StyleSheet (before `});` at end):

```typescript
metricsRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
salesHeadline: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginBottom: spacing.md },
sourceRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
sourceItem: { flex: 1, alignItems: "center" },
sourceValue: { fontSize: 20, fontWeight: "700", color: colors.primary },
sourceLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
sourceDivider: { width: 1, height: 32, backgroundColor: colors.separator },
paymentRow: { marginBottom: spacing.md },
paymentHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: 4 },
paymentDot: { width: 8, height: 8, borderRadius: 4 },
paymentLabel: { ...typography.body, color: colors.textPrimary, fontWeight: "500", flex: 1 },
paymentPct: { ...typography.body, color: colors.textSecondary, fontWeight: "600" },
paymentMeta: { marginTop: 2 },
paymentMetaText: { ...typography.small, color: colors.textTertiary },
customerRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, gap: spacing.sm },
customerName: { ...typography.body, color: colors.textPrimary, fontWeight: "500" },
customerMeta: { ...typography.small, color: colors.textSecondary },
```

**Step 8: Commit**

```bash
git add webnegosyo-app/app/(main)/analytics.tsx
git commit -m "feat(analytics): add Sales Overview, Payment Methods, Peak Hours, and Customer Insights sections to Analytics screen

New sections display above existing upsell/bundle cards:
- Sales Overview with revenue, growth %, cancellation metrics, source split
- Payment Methods with per-method bars, %, avg order value
- Peak Hours heatmap grid
- Customer Insights with return rate and top 10 customers"
```

---

## Task 8: Enhance Trends Screen — Source, Payment, and Cancellation Trends

**Files:**
- Modify: `webnegosyo-app/app/(main)/trends.tsx`

**Step 1: Add new query refs and interfaces**

After line 12, add:
```typescript
const getSalesAnalyticsRef = "analytics:getSalesAnalytics" as unknown as FunctionReference<"query">;
const getPaymentMethodAnalyticsRef = "analytics:getPaymentMethodAnalytics" as unknown as FunctionReference<"query">;
```

After line 19, add:
```typescript
interface SalesAnalytics {
  totalRevenue: number;
  totalOrders: number;
  completedOrders: number;
  avgOrderValue: number;
  cancelledOrders: number;
  cancelledRevenue: number;
  cancellationRate: number;
  ordersBySource: { web: number; mobile: number };
  ordersByStatus: Record<string, number>;
  revenueGrowth: number;
}

interface PaymentMethodAnalytics {
  methods: { method: string; count: number; revenue: number; percentage: number; avgOrderValue: number }[];
  dailyBreakdown: { date: string; methods: Record<string, number> }[];
}
```

**Step 2: Add query hooks**

After line 57, add:
```typescript
const { data: salesAnalytics } = useSafeQuery<SalesAnalytics>(getSalesAnalyticsRef, { daysBack });
const { data: paymentAnalytics } = useSafeQuery<PaymentMethodAnalytics>(getPaymentMethodAnalyticsRef, { daysBack });
```

**Step 3: Add new StackedBarChart component**

Before the `export default function TrendsScreen()` (above line 55), add:

```typescript
const PAYMENT_COLORS: Record<string, string> = {
  Cash: "#6366F1",
  GCash: "#10B981",
  Card: "#F59E0B",
  Unknown: "#94A3B8",
};

function StackedBarChart({ data, label }: {
  data: { date: string; methods: Record<string, number> }[];
  label: string;
}) {
  if (data.length === 0) return null;

  // Get all unique methods
  const allMethods = new Set<string>();
  for (const day of data) {
    for (const method of Object.keys(day.methods)) {
      allMethods.add(method);
    }
  }
  const methods = Array.from(allMethods);

  const maxTotal = Math.max(
    ...data.map((d) => Object.values(d.methods).reduce((s, v) => s + v, 0)),
    1
  );
  const barWidth = Math.max(((SCREEN_WIDTH - 100) / data.length) - 4, 6);

  return (
    <Card title={label} style={styles.chartCard}>
      {/* Legend */}
      <View style={stackStyles.legend}>
        {methods.map((m) => (
          <View key={m} style={stackStyles.legendItem}>
            <View style={[stackStyles.legendDot, { backgroundColor: PAYMENT_COLORS[m] ?? "#94A3B8" }]} />
            <Text style={stackStyles.legendText}>{m}</Text>
          </View>
        ))}
      </View>
      <View style={styles.barsContainer}>
        {data.map((d) => {
          const total = Object.values(d.methods).reduce((s, v) => s + v, 0);
          const height = (total / maxTotal) * 100;
          return (
            <View key={d.date} style={styles.barWrapper}>
              <View style={[{ height, width: barWidth, borderRadius: 3, overflow: "hidden" }]}>
                {methods.map((m) => {
                  const val = d.methods[m] ?? 0;
                  const segmentHeight = total > 0 ? (val / total) * height : 0;
                  return (
                    <View
                      key={m}
                      style={{
                        height: segmentHeight,
                        backgroundColor: PAYMENT_COLORS[m] ?? "#94A3B8",
                      }}
                    />
                  );
                })}
              </View>
              <Text style={styles.barLabel}>{d.date.slice(5)}</Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const stackStyles = StyleSheet.create({
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { ...typography.small, color: colors.textSecondary },
});
```

**Step 4: Add new sections after existing bar charts**

After the existing `BarChart` calls (after line 91), and before the closing `</>` on line 92, add:

```tsx
{/* Orders by Source */}
{salesAnalytics && (
  <Card title="Orders by Source" style={styles.chartCard}>
    <View style={sourceStyles.container}>
      <View style={sourceStyles.barRow}>
        <Text style={sourceStyles.label}>Web</Text>
        <View style={sourceStyles.barTrack}>
          <View style={[sourceStyles.barFill, {
            width: `${salesAnalytics.totalOrders > 0 ? (salesAnalytics.ordersBySource.web / salesAnalytics.totalOrders) * 100 : 0}%`,
            backgroundColor: colors.primary,
          }]} />
        </View>
        <Text style={sourceStyles.value}>{salesAnalytics.ordersBySource.web}</Text>
      </View>
      <View style={sourceStyles.barRow}>
        <Text style={sourceStyles.label}>App</Text>
        <View style={sourceStyles.barTrack}>
          <View style={[sourceStyles.barFill, {
            width: `${salesAnalytics.totalOrders > 0 ? (salesAnalytics.ordersBySource.mobile / salesAnalytics.totalOrders) * 100 : 0}%`,
            backgroundColor: colors.success,
          }]} />
        </View>
        <Text style={sourceStyles.value}>{salesAnalytics.ordersBySource.mobile}</Text>
      </View>
    </View>
  </Card>
)}

{/* Payment Trends */}
{paymentAnalytics && paymentAnalytics.dailyBreakdown.length > 0 && (
  <StackedBarChart data={paymentAnalytics.dailyBreakdown} label="Payment Trends" />
)}

{/* Cancellation Summary */}
{salesAnalytics && salesAnalytics.cancelledOrders > 0 && (
  <Card title="Cancellations" style={styles.chartCard}>
    <View style={cancelStyles.row}>
      <View style={cancelStyles.metric}>
        <Text style={cancelStyles.value}>{salesAnalytics.cancelledOrders}</Text>
        <Text style={cancelStyles.label}>Cancelled</Text>
      </View>
      <View style={cancelStyles.metric}>
        <Text style={cancelStyles.value}>₱{salesAnalytics.cancelledRevenue.toFixed(0)}</Text>
        <Text style={cancelStyles.label}>Lost Revenue</Text>
      </View>
      <View style={cancelStyles.metric}>
        <Text style={[cancelStyles.value, { color: colors.danger }]}>
          {(salesAnalytics.cancellationRate * 100).toFixed(1)}%
        </Text>
        <Text style={cancelStyles.label}>Cancel Rate</Text>
      </View>
    </View>
  </Card>
)}
```

**Step 5: Add new StyleSheets**

Append at the bottom of the file:

```typescript
const sourceStyles = StyleSheet.create({
  container: { gap: spacing.md },
  barRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  label: { ...typography.caption, color: colors.textSecondary, fontWeight: "500", width: 32 },
  barTrack: { flex: 1, height: 20, backgroundColor: colors.separator, borderRadius: 4 },
  barFill: { height: 20, borderRadius: 4 },
  value: { ...typography.body, color: colors.textPrimary, fontWeight: "600", width: 36, textAlign: "right" },
});

const cancelStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-around" },
  metric: { alignItems: "center" },
  value: { fontSize: 20, fontWeight: "700", color: colors.textPrimary },
  label: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
});
```

**Step 6: Commit**

```bash
git add webnegosyo-app/app/(main)/trends.tsx
git commit -m "feat(analytics): add Orders by Source, Payment Trends, and Cancellations to Trends screen

New sections below existing daily charts:
- Orders by Source: web vs mobile horizontal bars
- Payment Trends: stacked bar chart showing payment method mix per day
- Cancellations: count, lost revenue, and cancel rate"
```

---

## Task 9: Verify and Lint

**Step 1: Run lint on modified files**

```bash
cd /Users/codemedavid/Documents/whitelabel && npm run lint
```

Fix any lint errors.

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit --project webnegosyo-app/tsconfig.json 2>&1 | head -30
```

Fix any type errors.

**Step 3: Commit fixes if needed**

```bash
git add -A && git commit -m "fix: resolve lint and type errors in analytics"
```

---

## Task 10: Final Review and Integration Test

**Step 1: Review all changes**

Verify:
- 4 new Convex queries in `convex-template/convex/analytics.ts`
- 2 new components: `HeatmapGrid.tsx`, `GrowthIndicator.tsx`
- Enhanced `analytics.tsx` with 4 new sections (Sales Overview, Payment Methods, Peak Hours, Customer Insights)
- Enhanced `trends.tsx` with 3 new sections (Orders by Source, Payment Trends, Cancellations)
- All using existing `useSafeQuery` hook pattern
- No schema changes
- No new dependencies

**Step 2: Test graceful degradation**

Ensure screens still work when Convex URL is null (all new queries should show LoadingState or be skipped).

**Step 3: Final commit**

```bash
git add -A && git commit -m "feat: advanced sales analytics for webnegosyo merchant app

Adds comprehensive analytics to existing Analytics and Trends screens:
- Sales Overview with revenue growth, cancellation metrics, source split
- Enhanced Payment Methods with per-method stats and avg order value
- Peak Hours heatmap (7-day x 5-slot grid)
- Customer Insights: repeat vs new, return rate, top 10 customers
- Payment Trends: stacked bar chart by day
- Orders by Source: web vs mobile comparison
- Cancellation tracking: count, lost revenue, rate

All computed from existing orders data via 4 new Convex queries.
No schema changes. No new dependencies."
```
