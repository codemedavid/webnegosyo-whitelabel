"use client";

import { useState } from "react";
import { SafeConvexProvider } from "@/components/shared/safe-convex-provider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ConvexOrdersTab } from "@/components/admin/convex-orders-tab";
import type { BranchScope } from "@/lib/outlets/branch-scope";
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
  /** Passed down so cancelling an order can restore its stock. */
  tenantId?: string;
  /** The branch this admin may see, resolved on the server. */
  scope?: BranchScope;
}

function ConvexOrdersContent({ tenantId, scope }: { tenantId?: string; scope?: BranchScope }) {
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
          <ConvexOrdersTab tenantId={tenantId} scope={scope} />
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
        tenantId={tenantId}
      />
    </>
  );
}

export function ConvexOrdersWrapper({ convexUrl, tenantId, scope }: ConvexOrdersWrapperProps) {
  return (
    <SafeConvexProvider
      url={convexUrl}
      fallback={
        <div className="text-center py-12 text-muted-foreground">
          <p>Real-time orders unavailable.</p>
        </div>
      }
    >
      <ConvexOrdersContent tenantId={tenantId} scope={scope} />
    </SafeConvexProvider>
  );
}
