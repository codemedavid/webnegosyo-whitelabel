"use client";

import { Component, type ReactNode, type ErrorInfo } from "react";
import { ConvexProvider } from "convex/react";
import { getConvexClient } from "@/lib/convex/client";
import { useConvexOrders, useConvexDashboardStats } from "@/hooks/use-convex-orders";

class ConvexErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error, info: ErrorInfo) { console.warn("Convex orders error:", err, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <p>Real-time orders unavailable. Showing Supabase data instead.</p>
          <button className="text-primary underline mt-2 text-sm" onClick={() => this.setState({ hasError: false })}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface ConvexOrder {
  _id: string;
  _creationTime: number;
  customerName: string;
  customerContact: string;
  itemCount: number;
  orderType?: string;
  total: number;
  status: string;
}

interface ConvexOrdersWrapperProps {
  convexUrl: string;
  tenantSlug: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ConvexOrdersContent({ tenantSlug }: { tenantSlug: string }) {
  const orders = useConvexOrders();
  const stats = useConvexDashboardStats();

  if (!orders || !stats) {
    return <div className="p-8 text-center text-muted-foreground">Loading orders from Convex...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Today&apos;s Orders</p>
          <p className="text-2xl font-bold">{stats.totalOrders}</p>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Revenue</p>
          <p className="text-2xl font-bold">&#8369;{stats.totalRevenue.toFixed(2)}</p>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Avg Order Value</p>
          <p className="text-2xl font-bold">&#8369;{stats.avgOrderValue.toFixed(2)}</p>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Pending</p>
          <p className="text-2xl font-bold">{stats.statusCounts.pending}</p>
        </div>
      </div>

      {/* Orders list */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Recent Orders</h2>
        {orders.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No orders yet</p>
        ) : (
          orders.map((order: ConvexOrder) => (
            <div key={order._id} className="bg-card border rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium">{order.customerName}</p>
                  <p className="text-sm text-muted-foreground">{order.customerContact}</p>
                  <p className="text-sm text-muted-foreground">
                    {order.itemCount} item{order.itemCount !== 1 ? "s" : ""} · {order.orderType ?? "N/A"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold">&#8369;{order.total.toFixed(2)}</p>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    order.status === "pending" ? "bg-yellow-100 text-yellow-800" :
                    order.status === "confirmed" ? "bg-blue-100 text-blue-800" :
                    order.status === "preparing" ? "bg-orange-100 text-orange-800" :
                    order.status === "ready" ? "bg-green-100 text-green-800" :
                    order.status === "delivered" ? "bg-gray-100 text-gray-800" :
                    "bg-red-100 text-red-800"
                  }`}>
                    {order.status}
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(order._creationTime).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function ConvexOrdersWrapper({ convexUrl, tenantSlug }: ConvexOrdersWrapperProps) {
  const client = getConvexClient(convexUrl);

  return (
    <ConvexErrorBoundary>
      <ConvexProvider client={client}>
        <ConvexOrdersContent tenantSlug={tenantSlug} />
      </ConvexProvider>
    </ConvexErrorBoundary>
  );
}
