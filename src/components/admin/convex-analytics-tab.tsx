"use client";

import { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Users,
  ShoppingBag,
  Loader2,
} from "lucide-react";
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

const PERIOD_OPTIONS = [
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
  { label: "30 days", value: 30 },
] as const;

// ---------------------------------------------------------------------------
// Helper Components
// ---------------------------------------------------------------------------

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

function FunnelBar({
  label,
  value,
  maxValue,
  color,
}: {
  label: string;
  value: number;
  maxValue: number;
  color: string;
}) {
  const width = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", color)}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ConvexAnalyticsTab() {
  const [daysBack, setDaysBack] = useState(7);

  const sales = useConvexSalesAnalytics(daysBack);
  const paymentMethods = useConvexPaymentMethodAnalytics(daysBack);
  const heatmapData = useConvexOrderHeatmap(daysBack);
  const customers = useConvexCustomerInsights(daysBack);
  const upsell = useConvexUpsellAnalytics(daysBack);
  const bundles = useConvexBundleAnalytics(daysBack);
  const topItems = useConvexTopItems(daysBack, 10);

  // Cast to typed shapes coming from Convex (untyped in main app)
  const salesData = sales as
    | {
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
    | undefined;

  const paymentData = paymentMethods as
    | {
        methods: Array<{
          method: string;
          count: number;
          revenue: number;
          percentage: number;
          avgOrderValue: number;
        }>;
        dailyBreakdown: unknown;
      }
    | undefined;

  const heatmap = heatmapData as
    | {
        heatmap: Array<{ day: number; hour: number; count: number }>;
        peakHour: { day: number; hour: number; count: number };
        quietHour: { day: number; hour: number; count: number };
      }
    | undefined;

  const customerData = customers as
    | {
        totalCustomers: number;
        newCustomers: number;
        returningCustomers: number;
        returnRate: number;
        avgOrdersPerCustomer: number;
        avgRevenuePerCustomer: number;
        topCustomers: Array<{
          name: string;
          contact: string;
          orderCount: number;
          totalSpent: number;
          lastOrderDate: string;
        }>;
      }
    | undefined;

  const upsellData = upsell as
    | {
        shown: number;
        clicked: number;
        converted: number;
        clickRate: number;
        conversionRate: number;
      }
    | undefined;

  const bundleData = bundles as
    | {
        viewed: number;
        added: number;
        conversionRate: number;
      }
    | undefined;

  const topItemsData = topItems as
    | Array<{ itemId: string; name: string; count: number; revenue: number }>
    | undefined;

  // Loading state: wait for the first query
  if (!salesData) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const maxItemRevenue =
    topItemsData && topItemsData.length > 0 ? topItemsData[0].revenue : 0;

  // Payment methods chart config
  const chartConfig: Record<string, { label: string; color: string }> = {
    revenue: { label: "Revenue", color: "hsl(var(--chart-1))" },
  };

  const paymentChartData =
    paymentData?.methods.map((m) => ({
      name: m.method,
      revenue: m.revenue,
    })) ?? [];

  return (
    <div className="flex flex-col gap-6">
      {/* Period Selector */}
      <div className="flex flex-wrap gap-2">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setDaysBack(opt.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              daysBack === opt.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 1. Sales Overview */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Sales Overview</CardTitle>
          <GrowthBadge value={salesData.revenueGrowth} />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Revenue</p>
              <p className="text-xl font-bold">
                &#8369;{salesData.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Orders</p>
              <p className="text-xl font-bold">{salesData.totalOrders}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Value</p>
              <p className="text-xl font-bold">
                &#8369;{salesData.avgOrderValue.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cancelled</p>
              <p className="text-xl font-bold">
                {salesData.cancelledOrders}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  ({(salesData.cancellationRate * 100).toFixed(1)}%)
                </span>
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Web Orders</p>
              <p className="text-xl font-bold">
                {salesData.ordersBySource.web}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">App Orders</p>
              <p className="text-xl font-bold">
                {salesData.ordersBySource.mobile}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Payment Methods */}
      {paymentData && paymentData.methods.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Payment Methods
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <BarChart
                data={paymentChartData}
                layout="vertical"
                margin={{ left: 80 }}
              >
                <XAxis
                  type="number"
                  tickFormatter={(v: number) => `\u20B1${v}`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={70}
                  className="text-xs"
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} />
              </BarChart>
            </ChartContainer>

            <div className="space-y-2">
              {paymentData.methods.map((m) => (
                <div
                  key={m.method}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span>{m.method}</span>
                    <Badge variant="secondary" className="text-xs">
                      {m.percentage.toFixed(1)}%
                    </Badge>
                  </div>
                  <span className="font-medium">
                    &#8369;{m.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. Peak Hours Heatmap */}
      {heatmap && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Peak Hours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OrderHeatmap
              heatmap={heatmap.heatmap}
              peakHour={heatmap.peakHour}
            />
          </CardContent>
        </Card>
      )}

      {/* 4. Customer Insights */}
      {customerData && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Customer Insights
            </CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
              <div>
                <p className="text-xs text-muted-foreground">
                  Total Customers
                </p>
                <p className="text-xl font-bold">
                  {customerData.totalCustomers}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">New</p>
                <p className="text-xl font-bold">
                  {customerData.newCustomers}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Returning</p>
                <p className="text-xl font-bold">
                  {customerData.returningCustomers}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Return Rate</p>
                <p className="text-xl font-bold">
                  {(customerData.returnRate * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Avg Revenue / Customer
                </p>
                <p className="text-xl font-bold">
                  &#8369;{customerData.avgRevenuePerCustomer.toFixed(2)}
                </p>
              </div>
            </div>

            {customerData.topCustomers.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground">
                  Top Customers
                </h4>
                {customerData.topCustomers.map((c, i) => (
                  <div
                    key={c.contact}
                    className="flex items-center gap-3 text-sm"
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.name}</p>
                    </div>
                    <span className="shrink-0 font-semibold">
                      &#8369;{c.totalSpent.toFixed(2)}
                    </span>
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      {c.orderCount} orders
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 5. Upsell Funnel */}
      {upsellData && upsellData.shown > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Upsell Funnel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <FunnelBar
              label="Shown"
              value={upsellData.shown}
              maxValue={upsellData.shown}
              color="bg-blue-500"
            />
            <FunnelBar
              label="Clicked"
              value={upsellData.clicked}
              maxValue={upsellData.shown}
              color="bg-amber-500"
            />
            <FunnelBar
              label="Converted"
              value={upsellData.converted}
              maxValue={upsellData.shown}
              color="bg-green-500"
            />
            <div className="flex gap-4 pt-1 text-xs text-muted-foreground">
              <span>
                Click rate:{" "}
                <span className="font-medium text-foreground">
                  {(upsellData.clickRate * 100).toFixed(1)}%
                </span>
              </span>
              <span>
                Conversion rate:{" "}
                <span className="font-medium text-foreground">
                  {(upsellData.conversionRate * 100).toFixed(1)}%
                </span>
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 6. Bundle Performance */}
      {bundleData && bundleData.viewed > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Bundle Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <FunnelBar
              label="Viewed"
              value={bundleData.viewed}
              maxValue={bundleData.viewed}
              color="bg-purple-500"
            />
            <FunnelBar
              label="Added"
              value={bundleData.added}
              maxValue={bundleData.viewed}
              color="bg-green-500"
            />
            <div className="pt-1 text-xs text-muted-foreground">
              Conversion rate:{" "}
              <span className="font-medium text-foreground">
                {(bundleData.conversionRate * 100).toFixed(1)}%
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 7. Top Items by Revenue */}
      {topItemsData && topItemsData.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Top Items by Revenue
            </CardTitle>
            <ShoppingBag className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topItemsData.map((item, i) => {
                const barWidth =
                  maxItemRevenue > 0
                    ? (item.revenue / maxItemRevenue) * 100
                    : 0;
                return (
                  <div key={item.itemId} className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {item.name}
                      </span>
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        {item.count} sold
                      </Badge>
                      <span className="shrink-0 font-semibold">
                        &#8369;{item.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
