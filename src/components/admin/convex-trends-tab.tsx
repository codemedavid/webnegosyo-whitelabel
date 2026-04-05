"use client";

import { useState, useMemo } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Bar, BarChart, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  useConvexTrends,
  useConvexSalesAnalytics,
  useConvexPaymentMethodAnalytics,
} from "@/hooks/use-convex-orders";
import { cn } from "@/lib/utils";

const PERIOD_OPTIONS = [
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
  { label: "30 days", value: 30 },
] as const;

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

interface TrendDataPoint {
  date: string;
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
}

interface PaymentDailyBreakdown {
  date: string;
  methods: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ConvexTrendsTab() {
  const [daysBack, setDaysBack] = useState(7);

  const trends = useConvexTrends(daysBack);
  const sales = useConvexSalesAnalytics(daysBack);
  const paymentMethods = useConvexPaymentMethodAnalytics(daysBack);

  const trendsData = trends as TrendDataPoint[] | undefined;

  const salesData = sales as
    | {
        totalRevenue: number;
        totalOrders: number;
        cancelledOrders: number;
        cancelledRevenue: number;
        cancellationRate: number;
        ordersBySource: { web: number; mobile: number };
      }
    | undefined;

  const paymentData = paymentMethods as
    | {
        methods: Array<{ method: string }>;
        dailyBreakdown: PaymentDailyBreakdown[];
      }
    | undefined;

  // Transform trends data for charts
  const chartData = useMemo(() => {
    if (!trendsData || trendsData.length === 0) return [];
    return trendsData.map((d) => ({
      date: formatDate(d.date),
      orders: d.totalOrders,
      revenue: d.totalRevenue,
      avgValue: d.avgOrderValue,
    }));
  }, [trendsData]);

  // Build stacked payment chart data
  const { paymentChartData, paymentMethods: methodNames, paymentChartConfig } =
    useMemo(() => {
      if (
        !paymentData?.dailyBreakdown ||
        paymentData.dailyBreakdown.length === 0
      ) {
        return {
          paymentChartData: [],
          paymentMethods: [] as string[],
          paymentChartConfig: {} as Record<
            string,
            { label: string; color: string }
          >,
        };
      }

      // Extract all unique method names
      const allMethods = new Set<string>();
      for (const day of paymentData.dailyBreakdown) {
        for (const method of Object.keys(day.methods)) {
          allMethods.add(method);
        }
      }
      const methods = Array.from(allMethods);

      // Build chart config with cycling colors
      const config: Record<string, { label: string; color: string }> = {};
      for (let i = 0; i < methods.length; i++) {
        config[methods[i]] = {
          label: methods[i],
          color: CHART_COLORS[i % CHART_COLORS.length],
        };
      }

      // Build chart data
      const data = paymentData.dailyBreakdown.map((day) => {
        const entry: Record<string, string | number> = {
          date: formatDate(day.date),
        };
        for (const method of methods) {
          entry[method] = day.methods[method] ?? 0;
        }
        return entry;
      });

      return {
        paymentChartData: data,
        paymentMethods: methods,
        paymentChartConfig: config,
      };
    }, [paymentData]);

  // Loading state
  if (!trendsData) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Empty state
  if (trendsData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <AlertTriangle className="size-10 text-muted-foreground" />
        <div>
          <p className="font-medium">No trend data available yet</p>
          <p className="text-sm text-muted-foreground">
            Daily stats are aggregated at the end of each day
          </p>
        </div>
      </div>
    );
  }

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

      {/* 1. Daily Revenue Bar Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Daily Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              revenue: { label: "Revenue", color: "var(--chart-1)" },
            }}
            className="h-[200px] w-full"
          >
            <BarChart data={chartData}>
              <XAxis dataKey="date" className="text-xs" />
              <YAxis
                tickFormatter={(v: number) => `\u20B1${v}`}
                className="text-xs"
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="revenue" fill="var(--chart-1)" radius={4} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* 2. Daily Orders Bar Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Daily Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              orders: { label: "Orders", color: "var(--chart-2)" },
            }}
            className="h-[200px] w-full"
          >
            <BarChart data={chartData}>
              <XAxis dataKey="date" className="text-xs" />
              <YAxis className="text-xs" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="orders" fill="var(--chart-2)" radius={4} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* 3. Average Order Value Line Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Average Order Value
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              avgValue: {
                label: "Avg Order Value",
                color: "var(--chart-3)",
              },
            }}
            className="h-[200px] w-full"
          >
            <LineChart data={chartData}>
              <XAxis dataKey="date" className="text-xs" />
              <YAxis
                tickFormatter={(v: number) => `\u20B1${v}`}
                className="text-xs"
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                dataKey="avgValue"
                stroke="var(--chart-3)"
                type="monotone"
                dot={{ r: 3 }}
                strokeWidth={2}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* 4. Orders by Source */}
      {salesData && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Orders by Source
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Web</p>
                <p className="text-2xl font-bold">
                  {salesData.ordersBySource.web}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Mobile App</p>
                <p className="text-2xl font-bold">
                  {salesData.ordersBySource.mobile}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 5. Payment Method Trends (Stacked Bar Chart) */}
      {paymentChartData.length > 0 && methodNames.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Payment Method Trends
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={paymentChartConfig}
              className="h-[200px] w-full"
            >
              <BarChart data={paymentChartData}>
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <ChartTooltip content={<ChartTooltipContent />} />
                {methodNames.map((method, i) => (
                  <Bar
                    key={method}
                    dataKey={method}
                    stackId="payment"
                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                    radius={
                      i === methodNames.length - 1 ? [4, 4, 0, 0] : undefined
                    }
                  />
                ))}
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* 6. Cancellation Summary */}
      {salesData && salesData.cancelledOrders > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Cancellation Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Cancelled</p>
                <p className="text-2xl font-bold">
                  {salesData.cancelledOrders}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Lost Revenue</p>
                <p className="text-2xl font-bold text-red-600">
                  &#8369;
                  {salesData.cancelledRevenue.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Cancel Rate</p>
                <p className="text-2xl font-bold">
                  {(salesData.cancellationRate * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
