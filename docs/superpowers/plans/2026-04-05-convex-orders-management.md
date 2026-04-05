# Convex Orders Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the minimal ConvexOrdersWrapper with a full-featured order management system (Orders, Dashboard, Analytics, Trends tabs) matching the mobile merchant app, all powered by Convex.

**Architecture:** Single tabbed page using existing Shadcn Tabs + Sheet components. New Convex hooks call existing backend queries. Each tab is a separate component file. Tenants without `convex_deployment_url` see a setup prompt with existing Supabase fallback.

**Tech Stack:** Next.js 15 App Router, Convex React, Shadcn UI (Tabs, Sheet, Card, Badge), Recharts + Shadcn Chart component, Tailwind CSS 4, Lucide React icons.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/hooks/use-convex-orders.ts` | **Modify** — add analytics hook wrappers for all Convex analytics queries |
| `src/components/admin/convex-orders-wrapper.tsx` | **Rewrite** — tabs container with ConvexProvider, 4 tab layout |
| `src/components/admin/convex-orders-tab.tsx` | **Create** — order list with status filter pills, order cards |
| `src/components/admin/convex-order-sheet.tsx` | **Create** — slide-out right panel with order detail, status stepper, quick actions |
| `src/components/admin/convex-dashboard-tab.tsx` | **Create** — stat cards, real-time queue, recent pending orders |
| `src/components/admin/convex-analytics-tab.tsx` | **Create** — sales overview, payment methods chart, heatmap, customer insights, upsell/bundle funnels, top items |
| `src/components/admin/convex-trends-tab.tsx` | **Create** — daily revenue/orders charts, payment method trends, cancellation summary |
| `src/components/admin/order-status-stepper.tsx` | **Create** — visual step progression component |
| `src/components/admin/order-heatmap.tsx` | **Create** — 7x24 grid heatmap for peak hours |
| `src/components/ui/chart.tsx` | **Create** — install Shadcn chart component |
| `src/app/[tenant]/admin/orders/page.tsx` | **Modify** — add fallback message for tenants without Convex |

---

### Task 1: Install Dependencies (Recharts + Shadcn Chart)

**Files:**
- Create: `src/components/ui/chart.tsx` (via shadcn CLI)
- Modify: `package.json` (recharts added)

- [ ] **Step 1: Install Shadcn chart component**

Run:
```bash
npx shadcn@latest add chart
```

This installs `recharts` as a dependency and creates `src/components/ui/chart.tsx` with `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend`, `ChartLegendContent` components.

- [ ] **Step 2: Verify installation**

Run:
```bash
ls src/components/ui/chart.tsx && grep recharts package.json
```

Expected: file exists and recharts appears in dependencies.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/chart.tsx package.json package-lock.json
git commit -m "chore: install shadcn chart component and recharts"
```

---

### Task 2: Add Convex Analytics Hooks

**Files:**
- Modify: `src/hooks/use-convex-orders.ts`

- [ ] **Step 1: Add all analytics hook wrappers**

Add the following to `src/hooks/use-convex-orders.ts` after the existing hooks. Each hook follows the same pattern as existing ones — cast a string reference to `FunctionReference` and call `useQuery`:

```typescript
// Add these refs after the existing ones at the top of the file
const getDashboardStatsByPeriodRef = "orders:getDashboardStatsByPeriod" as unknown as FunctionReference<"query">;
const getSalesAnalyticsRef = "analytics:getSalesAnalytics" as unknown as FunctionReference<"query">;
const getPaymentMethodAnalyticsRef = "analytics:getPaymentMethodAnalytics" as unknown as FunctionReference<"query">;
const getOrderHeatmapRef = "analytics:getOrderHeatmap" as unknown as FunctionReference<"query">;
const getCustomerInsightsRef = "analytics:getCustomerInsights" as unknown as FunctionReference<"query">;
const getUpsellAnalyticsRef = "analytics:getUpsellAnalytics" as unknown as FunctionReference<"query">;
const getBundleAnalyticsRef = "analytics:getBundleAnalytics" as unknown as FunctionReference<"query">;
const getTopItemsRef = "analytics:getTopItems" as unknown as FunctionReference<"query">;
const getTrendsRef = "analytics:getTrends" as unknown as FunctionReference<"query">;
const getRevenueBreakdownRef = "analytics:getRevenueBreakdown" as unknown as FunctionReference<"query">;
const getUpsellTrendsRef = "analytics:getUpsellTrends" as unknown as FunctionReference<"query">;
const updatePaymentStatusRef = "orders:updatePaymentStatus" as unknown as FunctionReference<"mutation">;

// Add these hook functions after existing hooks

export function useConvexDashboardStatsByPeriod(startDate: number, endDate: number) {
  return useQuery(getDashboardStatsByPeriodRef, { startDate, endDate });
}

export function useConvexSalesAnalytics(daysBack: number) {
  return useQuery(getSalesAnalyticsRef, { daysBack });
}

export function useConvexPaymentMethodAnalytics(daysBack: number) {
  return useQuery(getPaymentMethodAnalyticsRef, { daysBack });
}

export function useConvexOrderHeatmap(daysBack: number) {
  return useQuery(getOrderHeatmapRef, { daysBack });
}

export function useConvexCustomerInsights(daysBack: number) {
  return useQuery(getCustomerInsightsRef, { daysBack });
}

export function useConvexUpsellAnalytics(daysBack: number) {
  return useQuery(getUpsellAnalyticsRef, { daysBack });
}

export function useConvexBundleAnalytics(daysBack: number) {
  return useQuery(getBundleAnalyticsRef, { daysBack });
}

export function useConvexTopItems(daysBack: number, limit?: number) {
  return useQuery(getTopItemsRef, { daysBack, limit });
}

export function useConvexTrends(daysBack: number) {
  return useQuery(getTrendsRef, { daysBack });
}

export function useConvexRevenueBreakdown(daysBack: number) {
  return useQuery(getRevenueBreakdownRef, { daysBack });
}

export function useConvexUpsellTrends(daysBack: number) {
  return useQuery(getUpsellTrendsRef, { daysBack });
}

export function useUpdateConvexPaymentStatus() {
  return useMutation(updatePaymentStatusRef);
}
```

- [ ] **Step 2: Verify the file compiles**

Run:
```bash
npx tsc --noEmit --pretty src/hooks/use-convex-orders.ts 2>&1 | head -20
```

If there are errors, they're likely just the general project-wide pre-existing issues. The hook file itself should have no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-convex-orders.ts
git commit -m "feat: add Convex analytics hooks for orders management"
```

---

### Task 3: Order Status Stepper Component

**Files:**
- Create: `src/components/admin/order-status-stepper.tsx`

- [ ] **Step 1: Create the status stepper component**

Create `src/components/admin/order-status-stepper.tsx`:

```tsx
"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUSES = ["pending", "confirmed", "preparing", "ready", "delivered"] as const;

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  delivered: "Delivered",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-orange-500",
  confirmed: "bg-blue-500",
  preparing: "bg-amber-500",
  ready: "bg-green-500",
  delivered: "bg-purple-500",
};

interface OrderStatusStepperProps {
  currentStatus: string;
}

export function OrderStatusStepper({ currentStatus }: OrderStatusStepperProps) {
  const isCancelled = currentStatus === "cancelled";
  const currentIndex = STATUSES.indexOf(currentStatus as typeof STATUSES[number]);

  if (isCancelled) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-800">
        <span className="size-3 rounded-full bg-red-500" />
        Order Cancelled
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {STATUSES.map((status, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <div key={status} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-xs font-bold",
                  isCompleted && cn(STATUS_COLORS[status], "text-white"),
                  isCurrent && cn(STATUS_COLORS[status], "text-white ring-2 ring-offset-2", `ring-${STATUS_COLORS[status].replace("bg-", "")}`),
                  !isCompleted && !isCurrent && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? <Check className="size-4" /> : index + 1}
              </div>
              <span
                className={cn(
                  "text-[10px] font-medium",
                  (isCompleted || isCurrent) ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {STATUS_LABELS[status]}
              </span>
            </div>
            {index < STATUSES.length - 1 && (
              <div
                className={cn(
                  "mx-1 h-0.5 flex-1",
                  index < currentIndex ? STATUS_COLORS[status] : "bg-muted"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify no lint errors**

Run:
```bash
npx eslint src/components/admin/order-status-stepper.tsx --no-error-on-unmatched-pattern
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/order-status-stepper.tsx
git commit -m "feat: add order status stepper component"
```

---

### Task 4: Order Heatmap Component

**Files:**
- Create: `src/components/admin/order-heatmap.tsx`

- [ ] **Step 1: Create the heatmap component**

Create `src/components/admin/order-heatmap.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => {
  const hour = i % 12 || 12;
  const ampm = i < 12 ? "a" : "p";
  return `${hour}${ampm}`;
});

// Show every 3rd hour to save space
const VISIBLE_HOURS = [0, 3, 6, 9, 12, 15, 18, 21];

interface HeatmapCell {
  day: number;
  hour: number;
  count: number;
}

interface OrderHeatmapProps {
  heatmap: HeatmapCell[];
  peakHour: { day: number; hour: number; count: number };
}

function getIntensityClass(count: number, maxCount: number): string {
  if (count === 0) return "bg-muted";
  const ratio = count / maxCount;
  if (ratio <= 0.25) return "bg-green-100 dark:bg-green-950";
  if (ratio <= 0.5) return "bg-green-300 dark:bg-green-800";
  if (ratio <= 0.75) return "bg-green-500 dark:bg-green-600 text-white";
  return "bg-green-700 dark:bg-green-400 text-white dark:text-black";
}

export function OrderHeatmap({ heatmap, peakHour }: OrderHeatmapProps) {
  const maxCount = Math.max(...heatmap.map((c) => c.count), 1);

  // Build grid lookup: key = "day-hour"
  const cellMap = new Map<string, number>();
  for (const cell of heatmap) {
    cellMap.set(`${cell.day}-${cell.hour}`, cell.count);
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <div className="min-w-[500px]">
          {/* Hour headers */}
          <div className="mb-1 flex">
            <div className="w-10" />
            {VISIBLE_HOURS.map((hour) => (
              <div
                key={hour}
                className="flex-1 text-center text-[10px] text-muted-foreground"
                style={{ minWidth: `${(100 / 8)}%` }}
              >
                {HOUR_LABELS[hour]}
              </div>
            ))}
          </div>

          {/* Day rows */}
          {DAY_LABELS.map((dayLabel, dayIndex) => (
            <div key={dayLabel} className="mb-0.5 flex items-center">
              <div className="w-10 text-xs text-muted-foreground">{dayLabel}</div>
              <div className="flex flex-1 gap-0.5">
                {Array.from({ length: 24 }, (_, hour) => {
                  const count = cellMap.get(`${dayIndex}-${hour}`) ?? 0;
                  return (
                    <div
                      key={hour}
                      className={cn(
                        "flex-1 rounded-sm aspect-square min-h-[14px] flex items-center justify-center text-[8px]",
                        getIntensityClass(count, maxCount)
                      )}
                      title={`${dayLabel} ${HOUR_LABELS[hour]}: ${count} orders`}
                    >
                      {count > 0 ? count : ""}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Peak hour annotation */}
      {peakHour.count > 0 && (
        <p className="text-xs text-muted-foreground">
          Peak: <span className="font-medium text-foreground">{DAY_LABELS[peakHour.day]} {HOUR_LABELS[peakHour.hour]}</span> — {peakHour.count} orders
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify no lint errors**

Run:
```bash
npx eslint src/components/admin/order-heatmap.tsx --no-error-on-unmatched-pattern
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/order-heatmap.tsx
git commit -m "feat: add order heatmap component for peak hours"
```

---

### Task 5: Convex Order Sheet (Slide-Out Detail Panel)

**Files:**
- Create: `src/components/admin/convex-order-sheet.tsx`

This component uses the existing Shadcn Sheet (`src/components/ui/sheet.tsx`) with `side="right"`. It displays full order detail with status stepper, quick action buttons, items, customer, delivery, and payment sections.

- [ ] **Step 1: Create the order sheet component**

Create `src/components/admin/convex-order-sheet.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  useConvexOrderById,
  useUpdateConvexOrderStatus,
  useUpdateConvexPaymentStatus,
} from "@/hooks/use-convex-orders";
import { OrderStatusStepper } from "@/components/admin/order-status-stepper";
import {
  Package,
  User,
  CreditCard,
  Truck,
  MapPin,
  Phone,
  Clock,
  XCircle,
  ArrowRight,
  Globe,
  Smartphone,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Id } from "convex/_generated/dataModel";

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: "Pending", bg: "bg-orange-100", text: "text-orange-800" },
  confirmed: { label: "Confirmed", bg: "bg-blue-100", text: "text-blue-800" },
  preparing: { label: "Preparing", bg: "bg-amber-100", text: "text-amber-800" },
  ready: { label: "Ready", bg: "bg-green-100", text: "text-green-800" },
  delivered: { label: "Delivered", bg: "bg-purple-100", text: "text-purple-800" },
  cancelled: { label: "Cancelled", bg: "bg-red-100", text: "text-red-800" },
};

const NEXT_STATUS: Record<string, string> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "ready",
  ready: "delivered",
};

const NEXT_STATUS_LABEL: Record<string, string> = {
  pending: "Mark as Confirmed",
  confirmed: "Mark as Preparing",
  preparing: "Mark as Ready",
  ready: "Mark as Delivered",
};

const CANCELLABLE_STATUSES = ["pending", "confirmed", "preparing", "ready"];

interface ConvexOrderSheetProps {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConvexOrderSheet({ orderId, open, onOpenChange }: ConvexOrderSheetProps) {
  const order = useConvexOrderById(orderId ?? "");
  const updateStatus = useUpdateConvexOrderStatus();
  const updatePaymentStatus = useUpdateConvexPaymentStatus();
  const [isUpdating, setIsUpdating] = useState(false);

  if (!orderId || !open) return null;

  const handleStatusUpdate = async (newStatus: string) => {
    setIsUpdating(true);
    try {
      await updateStatus({
        orderId: orderId as unknown as Id<"orders">,
        status: newStatus,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePaymentStatusUpdate = async (newStatus: string) => {
    try {
      await updatePaymentStatus({
        orderId: orderId as unknown as Id<"orders">,
        paymentStatus: newStatus,
      });
    } catch {
      // Silently handle — Convex will show error in dev console
    }
  };

  const nextStatus = order ? NEXT_STATUS[order.status] : undefined;
  const canCancel = order ? CANCELLABLE_STATUSES.includes(order.status) : false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        {!order ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                Order #{order._id.slice(-8)}
                <Badge className={cn(STATUS_CONFIG[order.status]?.bg, STATUS_CONFIG[order.status]?.text, "border-0")}>
                  {STATUS_CONFIG[order.status]?.label ?? order.status}
                </Badge>
              </SheetTitle>
              <SheetDescription className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {new Date(order._creationTime).toLocaleString()}
                </span>
                {order.source && (
                  <span className="flex items-center gap-1">
                    {order.source === "web" ? <Globe className="size-3" /> : <Smartphone className="size-3" />}
                    {order.source}
                  </span>
                )}
                {order.orderType && (
                  <Badge variant="outline" className="text-[10px]">{order.orderType}</Badge>
                )}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-4 px-4 pb-4">
              {/* Status Stepper */}
              <OrderStatusStepper currentStatus={order.status} />

              {/* Quick Action Buttons */}
              {(nextStatus || canCancel) && (
                <div className="flex gap-2">
                  {nextStatus && (
                    <Button
                      onClick={() => handleStatusUpdate(nextStatus)}
                      disabled={isUpdating}
                      className="flex-1"
                    >
                      {isUpdating ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <ArrowRight className="mr-2 size-4" />
                      )}
                      {NEXT_STATUS_LABEL[order.status]}
                    </Button>
                  )}
                  {canCancel && (
                    <Button
                      variant="destructive"
                      onClick={() => handleStatusUpdate("cancelled")}
                      disabled={isUpdating}
                      size={nextStatus ? "icon" : "default"}
                    >
                      <XCircle className="size-4" />
                      {!nextStatus && <span className="ml-2">Cancel Order</span>}
                    </Button>
                  )}
                </div>
              )}

              <Separator />

              {/* Items Section */}
              <Card className="py-3">
                <CardHeader className="px-4 py-0">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Package className="size-4" />
                    Items ({order.items?.length ?? 0})
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 py-0">
                  <div className="space-y-2">
                    {order.items?.map((item: Record<string, unknown>, index: number) => (
                      <div key={index} className="flex items-start justify-between gap-2 text-sm">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-[10px] px-1.5">
                              {item.quantity as number}x
                            </Badge>
                            <span className="font-medium">{item.menuItemName as string}</span>
                          </div>
                          {item.variation && (
                            <p className="ml-8 text-xs text-muted-foreground">{item.variation as string}</p>
                          )}
                          {(item.variationSelections as Array<{typeName: string; optionName: string}> | undefined)?.map(
                            (sel, i) => (
                              <p key={i} className="ml-8 text-xs text-muted-foreground">
                                {sel.typeName}: {sel.optionName}
                              </p>
                            )
                          )}
                          {(item.addons as Array<{name: string; price: number; quantity?: number}> | undefined)?.map(
                            (addon, i) => (
                              <p key={i} className="ml-8 text-xs text-blue-600">
                                + {addon.name} (₱{addon.price.toFixed(2)})
                              </p>
                            )
                          )}
                          {item.specialInstructions && (
                            <p className="ml-8 mt-1 rounded bg-yellow-50 px-2 py-0.5 text-xs text-yellow-800">
                              {item.specialInstructions as string}
                            </p>
                          )}
                          {item.isBundleItem && item.bundleName && (
                            <p className="ml-8 text-xs text-purple-600">
                              Bundle: {item.bundleName as string}
                              {item.slotName ? ` (${item.slotName as string})` : ""}
                            </p>
                          )}
                        </div>
                        <span className="text-sm font-medium">
                          ₱{(item.subtotal as number).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <Separator className="my-2" />

                  <div className="space-y-1 text-sm">
                    {order.deliveryFee != null && order.deliveryFee > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Delivery Fee</span>
                        <span>₱{order.deliveryFee.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold">
                      <span>Total</span>
                      <span>₱{order.total.toFixed(2)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Customer Section */}
              <Card className="py-3">
                <CardHeader className="px-4 py-0">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <User className="size-4" />
                    Customer
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 py-0 space-y-1 text-sm">
                  <p className="font-medium">{order.customerName}</p>
                  <p className="flex items-center gap-1 text-muted-foreground">
                    <Phone className="size-3" />
                    <a href={`tel:${order.customerContact}`} className="underline">
                      {order.customerContact}
                    </a>
                  </p>
                  {order.customerData && typeof order.customerData === "object" && (
                    <div className="mt-2 space-y-1">
                      {Object.entries(order.customerData as Record<string, string>).map(([key, value]) => (
                        <div key={key} className="flex justify-between text-xs">
                          <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                          <span>{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Delivery Section (conditional) */}
              {(order.deliveryAddress || order.lalamoveStatus) && (
                <Card className="py-3">
                  <CardHeader className="px-4 py-0">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Truck className="size-4" />
                      Delivery
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 py-0 space-y-2 text-sm">
                    {order.deliveryAddress && (
                      <p className="flex items-start gap-1 text-muted-foreground">
                        <MapPin className="mt-0.5 size-3 shrink-0" />
                        {order.deliveryAddress}
                      </p>
                    )}
                    {order.lalamoveStatus && (
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Lalamove Status</span>
                          <Badge variant="outline" className="text-[10px]">
                            {order.lalamoveStatus}
                          </Badge>
                        </div>
                        {order.lalamoveDriverName && (
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Driver</span>
                            <span>{order.lalamoveDriverName}</span>
                          </div>
                        )}
                        {order.lalamoveDriverPhone && (
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Driver Phone</span>
                            <a href={`tel:${order.lalamoveDriverPhone}`} className="underline">
                              {order.lalamoveDriverPhone}
                            </a>
                          </div>
                        )}
                        {order.lalamoveTrackingUrl && (
                          <a
                            href={order.lalamoveTrackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 underline"
                          >
                            Track Delivery <ArrowRight className="size-3" />
                          </a>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Payment Section */}
              {order.paymentMethod && (
                <Card className="py-3">
                  <CardHeader className="px-4 py-0">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <CreditCard className="size-4" />
                      Payment
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 py-0 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Method</span>
                      <span className="font-medium">{order.paymentMethod}</span>
                    </div>
                    {order.paymentMethodDetails && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Details</span>
                        <span>{order.paymentMethodDetails}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <select
                        value={order.paymentStatus ?? "pending"}
                        onChange={(e) => handlePaymentStatusUpdate(e.target.value)}
                        className="rounded border bg-background px-2 py-0.5 text-xs"
                      >
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                        <option value="verified">Verified</option>
                        <option value="failed">Failed</option>
                      </select>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Verify no lint errors**

Run:
```bash
npx eslint src/components/admin/convex-order-sheet.tsx --no-error-on-unmatched-pattern
```

Fix any issues. Common potential issues: the `Id` import from `convex/_generated/dataModel` may not resolve in the main app since generated types aren't available — if so, remove that import and keep the `as unknown as` cast inline.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/convex-order-sheet.tsx
git commit -m "feat: add convex order sheet with detail view and status actions"
```

---

### Task 6: Convex Orders Tab (Order List with Filters)

**Files:**
- Create: `src/components/admin/convex-orders-tab.tsx`

- [ ] **Step 1: Create the orders tab component**

Create `src/components/admin/convex-orders-tab.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useConvexOrders } from "@/hooks/use-convex-orders";
import { ConvexOrderSheet } from "@/components/admin/convex-order-sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Clock,
  Globe,
  Smartphone,
  Package,
  Loader2,
} from "lucide-react";

const STATUS_FILTERS = [
  { value: undefined, label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "preparing", label: "Preparing" },
  { value: "ready", label: "Ready" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
] as const;

const STATUS_PILL_COLORS: Record<string, string> = {
  pending: "bg-orange-100 text-orange-800 border-orange-200",
  confirmed: "bg-blue-100 text-blue-800 border-blue-200",
  preparing: "bg-amber-100 text-amber-800 border-amber-200",
  ready: "bg-green-100 text-green-800 border-green-200",
  delivered: "bg-purple-100 text-purple-800 border-purple-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
};

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ConvexOrdersTab() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const orders = useConvexOrders(statusFilter);

  const handleOrderClick = (orderId: string) => {
    setSelectedOrderId(orderId);
    setSheetOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.label}
            onClick={() => setStatusFilter(filter.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              statusFilter === filter.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted"
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Orders list */}
      {!orders ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Package className="mb-2 size-8" />
          <p>No orders found</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {orders.map((order: Record<string, unknown>) => {
            const status = order.status as string;
            const colors = STATUS_PILL_COLORS[status] ?? "bg-gray-100 text-gray-800 border-gray-200";

            return (
              <button
                key={order._id as string}
                onClick={() => handleOrderClick(order._id as string)}
                className="flex items-start justify-between rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/50"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{order.customerName as string}</span>
                    <Badge className={cn(colors, "border text-[10px]")}>
                      {status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{order.customerContact as string}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Package className="size-3" />
                      {order.itemCount as number} item{(order.itemCount as number) !== 1 ? "s" : ""}
                    </span>
                    {order.orderType && (
                      <span>{order.orderType as string}</span>
                    )}
                    {order.source && (
                      <span className="flex items-center gap-1">
                        {order.source === "web" ? <Globe className="size-3" /> : <Smartphone className="size-3" />}
                        {order.source as string}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold">₱{(order.total as number).toFixed(2)}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    {formatTimeAgo(order._creationTime as number)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Order detail sheet */}
      <ConvexOrderSheet
        orderId={selectedOrderId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify no lint errors**

Run:
```bash
npx eslint src/components/admin/convex-orders-tab.tsx --no-error-on-unmatched-pattern
```

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/convex-orders-tab.tsx
git commit -m "feat: add convex orders tab with status filter pills"
```

---

### Task 7: Convex Dashboard Tab

**Files:**
- Create: `src/components/admin/convex-dashboard-tab.tsx`

- [ ] **Step 1: Create the dashboard tab component**

Create `src/components/admin/convex-dashboard-tab.tsx`:

```tsx
"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useConvexDashboardStats,
  useConvexDashboardStatsByPeriod,
  useConvexOrderQueue,
  useConvexOrders,
} from "@/hooks/use-convex-orders";
import { cn } from "@/lib/utils";
import {
  ShoppingBag,
  DollarSign,
  TrendingUp,
  Activity,
  Clock,
  Package,
  Loader2,
} from "lucide-react";

type Period = "today" | "yesterday" | "this_week" | "this_month" | "this_year";

const PERIODS: { value: Period; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "this_year", label: "This Year" },
];

function getPeriodRange(period: Period): { start: number; end: number } | null {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case "today":
      return null; // Use getDashboardStats() instead
    case "yesterday": {
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      return { start: yesterdayStart.getTime(), end: todayStart.getTime() };
    }
    case "this_week": {
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      return { start: weekStart.getTime(), end: now.getTime() };
    }
    case "this_month": {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: monthStart.getTime(), end: now.getTime() };
    }
    case "this_year": {
      const yearStart = new Date(now.getFullYear(), 0, 1);
      return { start: yearStart.getTime(), end: now.getTime() };
    }
  }
}

const QUEUE_STATUSES = [
  { key: "pending", label: "Pending", color: "bg-orange-500" },
  { key: "confirmed", label: "Confirmed", color: "bg-blue-500" },
  { key: "preparing", label: "Preparing", color: "bg-amber-500" },
  { key: "ready", label: "Ready", color: "bg-green-500" },
] as const;

interface ConvexDashboardTabProps {
  onOrderClick: (orderId: string) => void;
}

export function ConvexDashboardTab({ onOrderClick }: ConvexDashboardTabProps) {
  const [period, setPeriod] = useState<Period>("today");

  const range = useMemo(() => getPeriodRange(period), [period]);

  // Use today-specific query when period is "today", otherwise use period query
  const todayStats = useConvexDashboardStats();
  const periodStats = useConvexDashboardStatsByPeriod(
    range?.start ?? 0,
    range?.end ?? 0
  );

  const stats = period === "today" ? todayStats : periodStats;
  const queue = useConvexOrderQueue();
  const pendingOrders = useConvexOrders("pending");

  if (!stats) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeOrders =
    (stats.statusCounts?.pending ?? 0) +
    (stats.statusCounts?.confirmed ?? 0) +
    (stats.statusCounts?.preparing ?? 0) +
    (stats.statusCounts?.ready ?? 0);

  const recentPending = (pendingOrders ?? []).slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              period === p.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="py-4">
          <CardContent className="px-4">
            <div className="flex items-center gap-2">
              <ShoppingBag className="size-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Orders</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{stats.totalOrders}</p>
          </CardContent>
        </Card>

        <Card className="py-4">
          <CardContent className="px-4">
            <div className="flex items-center gap-2">
              <DollarSign className="size-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Revenue</span>
            </div>
            <p className="mt-1 text-2xl font-bold">₱{stats.totalRevenue.toFixed(2)}</p>
          </CardContent>
        </Card>

        <Card className="py-4">
          <CardContent className="px-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Avg Order Value</span>
            </div>
            <p className="mt-1 text-2xl font-bold">₱{stats.avgOrderValue.toFixed(2)}</p>
          </CardContent>
        </Card>

        <Card className="py-4">
          <CardContent className="px-4">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Active Orders</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{activeOrders}</p>
          </CardContent>
        </Card>
      </div>

      {/* Real-time queue */}
      {queue && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Order Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-3">
              {QUEUE_STATUSES.map(({ key, label, color }) => {
                const count = (queue[key] as Array<unknown>)?.length ?? 0;
                return (
                  <div key={key} className="text-center">
                    <div className={cn("mx-auto mb-1 flex size-12 items-center justify-center rounded-xl text-lg font-bold text-white", color)}>
                      {count}
                    </div>
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent pending orders */}
      {recentPending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock className="size-4" />
              Recent Pending Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentPending.map((order: Record<string, unknown>) => (
                <button
                  key={order._id as string}
                  onClick={() => onOrderClick(order._id as string)}
                  className="flex w-full items-center justify-between rounded-md border p-3 text-left transition-colors hover:bg-muted/50"
                >
                  <div>
                    <p className="font-medium text-sm">{order.customerName as string}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Package className="size-3" />
                      {order.itemCount as number} items · {order.orderType as string ?? "N/A"}
                    </p>
                  </div>
                  <p className="font-bold text-sm">₱{(order.total as number).toFixed(2)}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify no lint errors**

Run:
```bash
npx eslint src/components/admin/convex-dashboard-tab.tsx --no-error-on-unmatched-pattern
```

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/convex-dashboard-tab.tsx
git commit -m "feat: add convex dashboard tab with stats and queue"
```

---

### Task 8: Convex Analytics Tab

**Files:**
- Create: `src/components/admin/convex-analytics-tab.tsx`

This is the largest tab. It uses Shadcn Charts (Recharts) for bar charts, and the custom `OrderHeatmap` component.

- [ ] **Step 1: Create the analytics tab component**

Create `src/components/admin/convex-analytics-tab.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import {
  useConvexSalesAnalytics,
  useConvexPaymentMethodAnalytics,
  useConvexOrderHeatmap,
  useConvexCustomerInsights,
  useConvexUpsellAnalytics,
  useConvexBundleAnalytics,
  useConvexTopItems,
} from "@/hooks/use-convex-orders";
import { OrderHeatmap } from "@/components/admin/order-heatmap";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Users,
  ShoppingBag,
  Loader2,
} from "lucide-react";

const PERIOD_OPTIONS = [
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
] as const;

function GrowthBadge({ value }: { value: number }) {
  const isPositive = value >= 0;
  const Icon = isPositive ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        isPositive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
      )}
    >
      <Icon className="size-3" />
      {(Math.abs(value) * 100).toFixed(1)}%
    </span>
  );
}

function FunnelBar({ label, value, maxValue, color }: { label: string; value: number; maxValue: number; color: string }) {
  const width = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function ConvexAnalyticsTab() {
  const [daysBack, setDaysBack] = useState(7);

  const sales = useConvexSalesAnalytics(daysBack);
  const paymentMethods = useConvexPaymentMethodAnalytics(daysBack);
  const heatmapData = useConvexOrderHeatmap(daysBack);
  const customers = useConvexCustomerInsights(daysBack);
  const upsell = useConvexUpsellAnalytics(daysBack);
  const bundles = useConvexBundleAnalytics(daysBack);
  const topItems = useConvexTopItems(daysBack, 10);

  const isLoading = !sales;

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex flex-wrap gap-2">
        {PERIOD_OPTIONS.map((p) => (
          <button
            key={p.value}
            onClick={() => setDaysBack(p.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              daysBack === p.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Sales Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-sm">
                <span>Sales Overview</span>
                <GrowthBadge value={sales.revenueGrowth} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">Revenue</p>
                  <p className="text-xl font-bold">₱{sales.totalRevenue.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Orders</p>
                  <p className="text-xl font-bold">{sales.totalOrders}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Avg Value</p>
                  <p className="text-xl font-bold">₱{sales.avgOrderValue.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Cancelled</p>
                  <p className="text-xl font-bold">{sales.cancelledOrders}</p>
                  <p className="text-xs text-muted-foreground">
                    {(sales.cancellationRate * 100).toFixed(1)}% rate
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Web Orders</p>
                  <p className="text-xl font-bold">{sales.ordersBySource.web}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">App Orders</p>
                  <p className="text-xl font-bold">{sales.ordersBySource.mobile}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Methods */}
          {paymentMethods && paymentMethods.methods.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Payment Methods</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={Object.fromEntries(
                    paymentMethods.methods.map((m: { method: string }, i: number) => [
                      m.method,
                      { label: m.method, color: `var(--chart-${(i % 5) + 1})` },
                    ])
                  )}
                  className="h-[200px] w-full"
                >
                  <BarChart
                    data={paymentMethods.methods.map((m: { method: string; revenue: number; count: number; percentage: number }) => ({
                      name: m.method,
                      revenue: m.revenue,
                      count: m.count,
                    }))}
                    layout="vertical"
                    margin={{ left: 80 }}
                  >
                    <XAxis type="number" tickFormatter={(v: number) => `₱${v}`} />
                    <YAxis type="category" dataKey="name" width={70} className="text-xs" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="revenue" fill="var(--chart-1)" radius={4} />
                  </BarChart>
                </ChartContainer>

                <div className="mt-3 space-y-1">
                  {paymentMethods.methods.map((m: { method: string; revenue: number; count: number; percentage: number }) => (
                    <div key={m.method} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{m.method}</span>
                      <span>{(m.percentage * 100).toFixed(1)}% · ₱{m.revenue.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Peak Hours Heatmap */}
          {heatmapData && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Peak Hours</CardTitle>
              </CardHeader>
              <CardContent>
                <OrderHeatmap
                  heatmap={heatmapData.heatmap}
                  peakHour={heatmapData.peakHour}
                />
              </CardContent>
            </Card>
          )}

          {/* Customer Insights */}
          {customers && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Users className="size-4" />
                  Customer Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Customers</p>
                    <p className="text-xl font-bold">{customers.totalCustomers}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">New</p>
                    <p className="text-xl font-bold">{customers.newCustomers}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Returning</p>
                    <p className="text-xl font-bold">{customers.returningCustomers}</p>
                    <p className="text-xs text-muted-foreground">
                      {(customers.returnRate * 100).toFixed(1)}% rate
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Orders/Customer</p>
                    <p className="text-xl font-bold">{customers.avgOrdersPerCustomer.toFixed(1)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Revenue/Customer</p>
                    <p className="text-xl font-bold">₱{customers.avgRevenuePerCustomer.toFixed(2)}</p>
                  </div>
                </div>

                {/* Top customers */}
                {customers.topCustomers.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Top Customers</p>
                    <div className="space-y-1">
                      {customers.topCustomers.map((c: { name: string; orderCount: number; totalSpent: number }, i: number) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                              {i + 1}
                            </span>
                            <span>{c.name}</span>
                          </div>
                          <div className="text-right text-xs">
                            <span className="font-medium">₱{c.totalSpent.toFixed(2)}</span>
                            <span className="ml-2 text-muted-foreground">{c.orderCount} orders</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Upsell Funnel */}
          {upsell && upsell.shown > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Upsell Performance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <FunnelBar label="Shown" value={upsell.shown} maxValue={upsell.shown} color="bg-blue-500" />
                <FunnelBar label="Clicked" value={upsell.clicked} maxValue={upsell.shown} color="bg-amber-500" />
                <FunnelBar label="Converted" value={upsell.converted} maxValue={upsell.shown} color="bg-green-500" />
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>Click rate: <strong className="text-foreground">{(upsell.clickRate * 100).toFixed(1)}%</strong></span>
                  <span>Conversion: <strong className="text-foreground">{(upsell.conversionRate * 100).toFixed(1)}%</strong></span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Bundle Performance */}
          {bundles && bundles.viewed > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Bundle Performance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <FunnelBar label="Viewed" value={bundles.viewed} maxValue={bundles.viewed} color="bg-purple-500" />
                <FunnelBar label="Added" value={bundles.added} maxValue={bundles.viewed} color="bg-green-500" />
                <p className="text-xs text-muted-foreground">
                  Conversion: <strong className="text-foreground">{(bundles.conversionRate * 100).toFixed(1)}%</strong>
                </p>
              </CardContent>
            </Card>
          )}

          {/* Top Items */}
          {topItems && topItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ShoppingBag className="size-4" />
                  Top Items by Revenue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {topItems.map((item: { itemId: string; name: string; count: number; revenue: number }, i: number) => {
                    const maxRevenue = topItems[0]?.revenue ?? 1;
                    const width = (item.revenue / maxRevenue) * 100;
                    return (
                      <div key={item.itemId} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                              {i + 1}
                            </span>
                            <span>{item.name}</span>
                            <Badge variant="secondary" className="text-[10px]">{item.count} sold</Badge>
                          </div>
                          <span className="font-medium">₱{item.revenue.toFixed(2)}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify no lint errors**

Run:
```bash
npx eslint src/components/admin/convex-analytics-tab.tsx --no-error-on-unmatched-pattern
```

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/convex-analytics-tab.tsx
git commit -m "feat: add convex analytics tab with sales, heatmap, customers, funnels"
```

---

### Task 9: Convex Trends Tab

**Files:**
- Create: `src/components/admin/convex-trends-tab.tsx`

- [ ] **Step 1: Create the trends tab component**

Create `src/components/admin/convex-trends-tab.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis, Line, LineChart } from "recharts";
import {
  useConvexTrends,
  useConvexSalesAnalytics,
  useConvexPaymentMethodAnalytics,
} from "@/hooks/use-convex-orders";
import { cn } from "@/lib/utils";
import { Loader2, AlertTriangle } from "lucide-react";

const PERIOD_OPTIONS = [
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
] as const;

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ConvexTrendsTab() {
  const [daysBack, setDaysBack] = useState(7);

  const trends = useConvexTrends(daysBack);
  const sales = useConvexSalesAnalytics(daysBack);
  const paymentMethods = useConvexPaymentMethodAnalytics(daysBack);

  const isLoading = !trends;

  const trendData = (trends ?? []).map((d: { date: string; totalOrders: number; totalRevenue: number; avgOrderValue: number }) => ({
    date: formatDate(d.date),
    rawDate: d.date,
    orders: d.totalOrders,
    revenue: d.totalRevenue,
    avgValue: d.avgOrderValue,
  }));

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex flex-wrap gap-2">
        {PERIOD_OPTIONS.map((p) => (
          <button
            key={p.value}
            onClick={() => setDaysBack(p.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              daysBack === p.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : trendData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <AlertTriangle className="mb-2 size-8" />
          <p>No trend data available yet</p>
          <p className="text-xs">Daily stats are aggregated at the end of each day</p>
        </div>
      ) : (
        <>
          {/* Daily Revenue */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Daily Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  revenue: { label: "Revenue", color: "var(--chart-1)" },
                }}
                className="h-[200px] w-full"
              >
                <BarChart data={trendData}>
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis tickFormatter={(v: number) => `₱${v}`} className="text-xs" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="revenue" fill="var(--chart-1)" radius={4} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Daily Orders */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Daily Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  orders: { label: "Orders", color: "var(--chart-2)" },
                }}
                className="h-[200px] w-full"
              >
                <BarChart data={trendData}>
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="orders" fill="var(--chart-2)" radius={4} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Avg Order Value Trend */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Average Order Value</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  avgValue: { label: "Avg Value", color: "var(--chart-3)" },
                }}
                className="h-[200px] w-full"
              >
                <LineChart data={trendData}>
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis tickFormatter={(v: number) => `₱${v}`} className="text-xs" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="avgValue"
                    stroke="var(--chart-3)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Orders by Source */}
          {sales && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Orders by Source</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border p-4 text-center">
                    <p className="text-sm text-muted-foreground">Web</p>
                    <p className="text-2xl font-bold">{sales.ordersBySource.web}</p>
                  </div>
                  <div className="rounded-lg border p-4 text-center">
                    <p className="text-sm text-muted-foreground">Mobile App</p>
                    <p className="text-2xl font-bold">{sales.ordersBySource.mobile}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Payment Method Trends */}
          {paymentMethods && paymentMethods.dailyBreakdown.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Payment Method Trends</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const allMethods = new Set<string>();
                  for (const day of paymentMethods.dailyBreakdown) {
                    for (const method of Object.keys((day as { date: string; methods: Record<string, number> }).methods)) {
                      allMethods.add(method);
                    }
                  }
                  const methodsList = Array.from(allMethods);
                  const chartColors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

                  return (
                    <ChartContainer
                      config={Object.fromEntries(
                        methodsList.map((m, i) => [m, { label: m, color: chartColors[i % chartColors.length] }])
                      )}
                      className="h-[200px] w-full"
                    >
                      <BarChart
                        data={paymentMethods.dailyBreakdown.map((d: { date: string; methods: Record<string, number> }) => ({
                          date: formatDate(d.date),
                          ...d.methods,
                        }))}
                      >
                        <XAxis dataKey="date" className="text-xs" />
                        <YAxis tickFormatter={(v: number) => `₱${v}`} className="text-xs" />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        {methodsList.map((method, i) => (
                          <Bar
                            key={method}
                            dataKey={method}
                            fill={chartColors[i % chartColors.length]}
                            stackId="payment"
                            radius={i === methodsList.length - 1 ? [4, 4, 0, 0] : 0}
                          />
                        ))}
                      </BarChart>
                    </ChartContainer>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {/* Cancellation Summary */}
          {sales && sales.cancelledOrders > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="size-4 text-red-500" />
                  Cancellation Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Cancelled</p>
                    <p className="text-xl font-bold">{sales.cancelledOrders}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Lost Revenue</p>
                    <p className="text-xl font-bold text-red-600">₱{sales.cancelledRevenue.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Cancel Rate</p>
                    <p className="text-xl font-bold">{(sales.cancellationRate * 100).toFixed(1)}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify no lint errors**

Run:
```bash
npx eslint src/components/admin/convex-trends-tab.tsx --no-error-on-unmatched-pattern
```

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/convex-trends-tab.tsx
git commit -m "feat: add convex trends tab with charts and cancellation summary"
```

---

### Task 10: Rewrite ConvexOrdersWrapper (Tabs Container)

**Files:**
- Modify: `src/components/admin/convex-orders-wrapper.tsx`

This is the main container. It wraps everything in `ConvexProvider` and renders 4 tabs.

- [ ] **Step 1: Rewrite the wrapper component**

Replace the entire content of `src/components/admin/convex-orders-wrapper.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ConvexProvider } from "convex/react";
import { getConvexClient } from "@/lib/convex/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ConvexOrdersTab } from "@/components/admin/convex-orders-tab";
import { ConvexDashboardTab } from "@/components/admin/convex-dashboard-tab";
import { ConvexAnalyticsTab } from "@/components/admin/convex-analytics-tab";
import { ConvexTrendsTab } from "@/components/admin/convex-trends-tab";
import { ConvexOrderSheet } from "@/components/admin/convex-order-sheet";
import {
  ShoppingBag,
  LayoutDashboard,
  BarChart3,
  TrendingUp,
} from "lucide-react";

interface ConvexOrdersWrapperProps {
  convexUrl: string;
  tenantSlug: string;
}

function ConvexOrdersContent({ tenantSlug }: { tenantSlug: string }) {
  const [sheetOrderId, setSheetOrderId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleOrderClick = (orderId: string) => {
    setSheetOrderId(orderId);
    setSheetOpen(true);
  };

  return (
    <>
      <Tabs defaultValue="orders">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="orders" className="gap-1.5">
            <ShoppingBag className="size-4" />
            Orders
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="gap-1.5">
            <LayoutDashboard className="size-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5">
            <BarChart3 className="size-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="trends" className="gap-1.5">
            <TrendingUp className="size-4" />
            Trends
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-4">
          <ConvexOrdersTab />
        </TabsContent>

        <TabsContent value="dashboard" className="mt-4">
          <ConvexDashboardTab onOrderClick={handleOrderClick} />
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <ConvexAnalyticsTab />
        </TabsContent>

        <TabsContent value="trends" className="mt-4">
          <ConvexTrendsTab />
        </TabsContent>
      </Tabs>

      {/* Shared order sheet for dashboard pending order clicks */}
      <ConvexOrderSheet
        orderId={sheetOrderId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  );
}

export function ConvexOrdersWrapper({ convexUrl, tenantSlug }: ConvexOrdersWrapperProps) {
  const client = getConvexClient(convexUrl);

  return (
    <ConvexProvider client={client}>
      <ConvexOrdersContent tenantSlug={tenantSlug} />
    </ConvexProvider>
  );
}
```

- [ ] **Step 2: Verify no lint errors**

Run:
```bash
npx eslint src/components/admin/convex-orders-wrapper.tsx --no-error-on-unmatched-pattern
```

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/convex-orders-wrapper.tsx
git commit -m "feat: rewrite ConvexOrdersWrapper with tabbed orders, dashboard, analytics, trends"
```

---

### Task 11: Update Orders Page with Fallback

**Files:**
- Modify: `src/app/[tenant]/admin/orders/page.tsx`

- [ ] **Step 1: Add fallback message for tenants without Convex**

In `src/app/[tenant]/admin/orders/page.tsx`, add a fallback info card in the non-Convex branch. Add this import at the top:

```tsx
import { Info } from 'lucide-react'
```

Then, in the else branch (around line 97), add the info card before the Suspense block:

```tsx
  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/${tenantSlug}/admin` },
          { label: 'Orders' },
        ]}
      />

      <div>
        <h1 className="text-3xl font-bold">Orders</h1>
        <p className="text-muted-foreground">Manage customer orders</p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <Info className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-medium">Limited Mode</p>
          <p className="text-blue-700">Real-time order management with analytics requires Convex setup. Contact support to enable full features.</p>
        </div>
      </div>

      <Suspense fallback={<OrdersSkeleton />}>
        <OrdersContent
          tenantSlug={tenantSlug}
          tenantId={tenant.id}
          page={page}
          status={status}
          orderType={orderType}
        />
      </Suspense>
    </div>
  )
```

- [ ] **Step 2: Verify no lint errors**

Run:
```bash
npx eslint src/app/[tenant]/admin/orders/page.tsx --no-error-on-unmatched-pattern
```

- [ ] **Step 3: Commit**

```bash
git add src/app/[tenant]/admin/orders/page.tsx
git commit -m "feat: add fallback info card for tenants without Convex"
```

---

### Task 12: Lint Check and Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full lint**

Run:
```bash
npm run lint
```

Fix any lint errors in the new files. Pre-existing lint errors in other files can be ignored.

- [ ] **Step 2: Run build**

Run:
```bash
npm run build
```

Fix any TypeScript compilation errors in the new/modified files. Pre-existing build issues (e.g. `mcp/src/index.ts`, `menu-engineering.ts:92`) can be ignored.

- [ ] **Step 3: Final commit (if fixes were needed)**

```bash
git add -A
git commit -m "fix: resolve lint and build issues in convex orders management"
```
