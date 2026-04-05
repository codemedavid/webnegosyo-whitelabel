"use client";

import { useState, useMemo } from "react";
import {
  ShoppingBag,
  DollarSign,
  TrendingUp,
  Activity,
  Clock,
  Package,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useConvexDashboardStats,
  useConvexDashboardStatsByPeriod,
  useConvexOrderQueue,
  useConvexOrders,
} from "@/hooks/use-convex-orders";
import { cn } from "@/lib/utils";

const PERIODS = [
  "Today",
  "Yesterday",
  "This Week",
  "This Month",
  "This Year",
] as const;

type Period = (typeof PERIODS)[number];

interface ConvexDashboardTabProps {
  onOrderClick: (orderId: string) => void;
}

function computePeriodRange(period: Period): { start: number; end: number } {
  const now = new Date();

  switch (period) {
    case "Yesterday": {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const todayMidnight = new Date(now);
      todayMidnight.setHours(0, 0, 0, 0);
      return { start: yesterday.getTime(), end: todayMidnight.getTime() };
    }
    case "This Week": {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      return { start: startOfWeek.getTime(), end: now.getTime() };
    }
    case "This Month": {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: startOfMonth.getTime(), end: now.getTime() };
    }
    case "This Year": {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      return { start: startOfYear.getTime(), end: now.getTime() };
    }
    default:
      return { start: 0, end: 0 };
  }
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

const QUEUE_STATUSES = [
  { key: "pending", label: "Pending", color: "bg-orange-500" },
  { key: "confirmed", label: "Confirmed", color: "bg-blue-500" },
  { key: "preparing", label: "Preparing", color: "bg-amber-500" },
  { key: "ready", label: "Ready", color: "bg-green-500" },
] as const;

export function ConvexDashboardTab({ onOrderClick }: ConvexDashboardTabProps) {
  const [period, setPeriod] = useState<Period>("Today");

  const { start, end } = useMemo(() => computePeriodRange(period), [period]);

  // Both hooks must always be called (React rules of hooks)
  const todayStats = useConvexDashboardStats();
  const periodStats = useConvexDashboardStatsByPeriod(
    period === "Today" ? 0 : start,
    period === "Today" ? 0 : end
  );

  const stats = period === "Today" ? todayStats : periodStats;

  const queue = useConvexOrderQueue();
  const pendingOrders = useConvexOrders("pending");

  const isStatsLoading = stats === undefined;
  const isQueueLoading = queue === undefined;
  const isPendingLoading = pendingOrders === undefined;

  const activeOrders = stats
    ? (stats.statusCounts?.pending ?? 0) +
      (stats.statusCounts?.confirmed ?? 0) +
      (stats.statusCounts?.preparing ?? 0) +
      (stats.statusCounts?.ready ?? 0)
    : 0;

  const recentPending = Array.isArray(pendingOrders)
    ? pendingOrders.slice(0, 5)
    : [];

  return (
    <div className="flex flex-col gap-6">
      {/* Period Selector */}
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              period === p
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted"
            )}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Stat Cards */}
      {isStatsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Total Orders
              </CardTitle>
              <ShoppingBag className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats?.totalOrders ?? 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Revenue</CardTitle>
              <DollarSign className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                &#8369;{(stats?.totalRevenue ?? 0).toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Avg Order Value
              </CardTitle>
              <TrendingUp className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                &#8369;{(stats?.avgOrderValue ?? 0).toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Active Orders
              </CardTitle>
              <Activity className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeOrders}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Real-Time Queue */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Real-Time Queue</h3>
        {isQueueLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {QUEUE_STATUSES.map(({ key, label, color }) => {
              const queueData = queue as Record<string, unknown[]> | undefined;
              const count = Array.isArray(queueData?.[key])
                ? queueData[key].length
                : 0;
              return (
                <div key={key} className="flex flex-col items-center gap-1.5">
                  <div
                    className={cn(
                      "flex size-16 items-center justify-center rounded-lg",
                      color
                    )}
                  >
                    <span className="text-2xl font-bold text-white">
                      {count}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Pending Orders */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Recent Pending Orders</h3>
        </div>
        {isPendingLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : recentPending.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
            <Package className="size-10 stroke-1" />
            <p className="text-sm">No pending orders</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {recentPending.map((order: Record<string, unknown>) => {
              const orderId = order._id as string;
              const customerName =
                (order.customerName as string) || "Unknown";
              const itemCount = (order.itemCount as number) || 0;
              const orderType = order.orderType as string | undefined;
              const total = (order.total as number) || 0;
              const creationTime = order._creationTime as number;

              return (
                <button
                  key={orderId}
                  type="button"
                  onClick={() => onOrderClick(orderId)}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">
                      {customerName}
                    </span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {itemCount} {itemCount === 1 ? "item" : "items"}
                      </span>
                      {orderType && (
                        <>
                          <span>&middot;</span>
                          <span className="capitalize">{orderType}</span>
                        </>
                      )}
                      <span>&middot;</span>
                      <span>{formatTimeAgo(creationTime)}</span>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold">
                    &#8369;{total.toFixed(2)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
