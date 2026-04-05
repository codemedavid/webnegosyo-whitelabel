"use client";

import { useState } from "react";
import { Clock, Globe, Smartphone, Package, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useConvexOrders } from "@/hooks/use-convex-orders";
import { ConvexOrderSheet } from "@/components/admin/convex-order-sheet";
import { cn } from "@/lib/utils";

const STATUS_FILTERS = [
  "all",
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "delivered",
  "cancelled",
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

export function ConvexOrdersTab() {
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const statusArg = activeFilter === "all" ? undefined : activeFilter;
  const orders = useConvexOrders(statusArg);

  const isLoading = orders === undefined;

  function handleOrderClick(orderId: string) {
    setSelectedOrderId(orderId);
    setSheetOpen(true);
  }

  function handleSheetOpenChange(open: boolean) {
    setSheetOpen(open);
    if (!open) {
      setSelectedOrderId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Status Filter Pills */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setActiveFilter(filter)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              activeFilter === filter
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted"
            )}
          >
            {filter.charAt(0).toUpperCase() + filter.slice(1)}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && Array.isArray(orders) && orders.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
          <Package className="size-12 stroke-1" />
          <p className="text-sm font-medium">No orders found</p>
        </div>
      )}

      {/* Order Cards */}
      {!isLoading && Array.isArray(orders) && orders.length > 0 && (
        <div className="flex flex-col gap-2">
          {orders.map((order: Record<string, unknown>) => {
            const orderId = order._id as string;
            const creationTime = order._creationTime as number;
            const customerName = (order.customerName as string) || "Unknown";
            const customerContact = (order.customerContact as string) || "";
            const total = (order.total as number) || 0;
            const itemCount = (order.itemCount as number) || 0;
            const status = (order.status as string) || "pending";
            const orderType = order.orderType as string | undefined;
            const source = order.source as string | undefined;

            return (
              <button
                key={orderId}
                type="button"
                onClick={() => handleOrderClick(orderId)}
                className="flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50"
              >
                {/* Customer Info */}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {customerName}
                    </span>
                    {source && (
                      <span className="shrink-0 text-muted-foreground">
                        {source === "mobile" ? (
                          <Smartphone className="size-3.5" />
                        ) : (
                          <Globe className="size-3.5" />
                        )}
                      </span>
                    )}
                  </div>
                  {customerContact && (
                    <span className="truncate text-xs text-muted-foreground">
                      {customerContact}
                    </span>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    <span>{formatTimeAgo(creationTime)}</span>
                    {orderType && (
                      <>
                        <span>&middot;</span>
                        <span className="capitalize">{orderType}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Right Side: Total, Count, Status */}
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-semibold">
                    &#8369;{total.toFixed(2)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {itemCount} {itemCount === 1 ? "item" : "items"}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] capitalize",
                      STATUS_PILL_COLORS[status]
                    )}
                  >
                    {status}
                  </Badge>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Order Detail Sheet */}
      <ConvexOrderSheet
        orderId={selectedOrderId}
        open={sheetOpen}
        onOpenChange={handleSheetOpenChange}
      />
    </div>
  );
}
