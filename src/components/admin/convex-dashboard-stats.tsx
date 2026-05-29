"use client";

import Link from "next/link";
import { DollarSign, ShoppingBag, TrendingUp, Clock, UtensilsCrossed } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SafeConvexProvider } from "@/components/shared/safe-convex-provider";
import {
  useConvexDashboardStats,
  useConvexOrderQueue,
} from "@/hooks/use-convex-orders";

interface ConvexDashboardStatsProps {
  convexUrl: string;
  tenantSlug: string;
  menuItemsCount: number;
  availableItemsCount: number;
  categoriesCount: number;
}

interface DashboardStats {
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  statusCounts?: Record<string, number>;
}

interface QueueOrder {
  _id: string;
}

function StatsContent({
  tenantSlug,
  menuItemsCount,
  availableItemsCount,
  categoriesCount,
}: Omit<ConvexDashboardStatsProps, "convexUrl">) {
  const stats = useConvexDashboardStats() as DashboardStats | undefined;
  const queue = useConvexOrderQueue() as Record<string, QueueOrder[]> | undefined;

  const todayOrders = stats?.totalOrders ?? 0;
  const todayRevenue = stats?.totalRevenue ?? 0;
  const pendingCount = queue?.pending?.length ?? stats?.statusCounts?.pending ?? 0;
  const confirmedCount = queue?.confirmed?.length ?? stats?.statusCounts?.confirmed ?? 0;
  const preparingCount = queue?.preparing?.length ?? stats?.statusCounts?.preparing ?? 0;
  const readyCount = queue?.ready?.length ?? stats?.statusCounts?.ready ?? 0;

  const ordersHref = `/${tenantSlug}/admin/orders`;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Menu Items</CardTitle>
            <UtensilsCrossed className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{menuItemsCount}</div>
            <p className="text-xs text-muted-foreground">{availableItemsCount} available</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
            <UtensilsCrossed className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categoriesCount}</div>
            <p className="text-xs text-muted-foreground">Active categories</p>
          </CardContent>
        </Card>

        <Link href={ordersHref} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
          <Card className="transition-colors hover:bg-muted/40 cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today&apos;s Orders</CardTitle>
              <ShoppingBag className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats === undefined ? "—" : todayOrders}
              </div>
              <p className="text-xs text-muted-foreground">{pendingCount} pending</p>
            </CardContent>
          </Card>
        </Link>

        <Link href={ordersHref} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
          <Card className="transition-colors hover:bg-muted/40 cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today&apos;s Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats === undefined ? "—" : `₱${todayRevenue.toFixed(2)}`}
              </div>
              <p className="text-xs text-muted-foreground">Total sales today</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Link href={`/${tenantSlug}/admin/menu/new`} className="text-sm hover:underline">
              + Add Menu Item
            </Link>
            <Link href={`/${tenantSlug}/admin/categories`} className="text-sm hover:underline">
              Manage Categories
            </Link>
            <Link href={ordersHref} className="text-sm hover:underline">
              View Orders
            </Link>
          </CardContent>
        </Card>

        <Link href={ordersHref} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
          <Card className="transition-colors hover:bg-muted/40 cursor-pointer">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ActivityRow icon={<Clock className="h-4 w-4 text-yellow-600" />} label="Pending" value={pendingCount} />
              <ActivityRow icon={<TrendingUp className="h-4 w-4 text-blue-600" />} label="Confirmed" value={confirmedCount} />
              <ActivityRow icon={<UtensilsCrossed className="h-4 w-4 text-orange-600" />} label="Preparing" value={preparingCount} />
              <ActivityRow icon={<ShoppingBag className="h-4 w-4 text-green-600" />} label="Ready" value={readyCount} />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}

function ActivityRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

export function ConvexDashboardStats({ convexUrl, ...rest }: ConvexDashboardStatsProps) {
  return (
    <SafeConvexProvider
      url={convexUrl}
      fallback={
        <StatsContent
          tenantSlug={rest.tenantSlug}
          menuItemsCount={rest.menuItemsCount}
          availableItemsCount={rest.availableItemsCount}
          categoriesCount={rest.categoriesCount}
        />
      }
    >
      <StatsContent {...rest} />
    </SafeConvexProvider>
  );
}
