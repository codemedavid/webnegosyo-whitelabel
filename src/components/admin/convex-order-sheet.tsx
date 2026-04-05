"use client";

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OrderStatusStepper } from "@/components/admin/order-status-stepper";
import {
  useConvexOrderById,
  useUpdateConvexOrderStatus,
  useUpdateConvexPaymentStatus,
} from "@/hooks/use-convex-orders";

interface ConvexOrderSheetProps {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_FLOW: Record<string, string> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "ready",
  ready: "delivered",
};

const NEXT_STATUS_LABELS: Record<string, string> = {
  pending: "Confirm Order",
  confirmed: "Start Preparing",
  preparing: "Mark Ready",
  ready: "Mark Delivered",
};

const CANCELLABLE_STATUSES = new Set(["pending", "confirmed", "preparing", "ready"]);

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: "text-orange-600",
  paid: "text-green-600",
  verified: "text-blue-600",
  failed: "text-red-600",
};

function formatCurrency(amount: number): string {
  return `\u20B1${amount.toFixed(2)}`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function ConvexOrderSheet({ orderId, open, onOpenChange }: ConvexOrderSheetProps) {
  const order = useConvexOrderById(orderId ?? "");
  const updateStatus = useUpdateConvexOrderStatus();
  const updatePaymentStatus = useUpdateConvexPaymentStatus();

  const isLoading = open && orderId && order === undefined;
  const currentStatus = order?.status ?? "";
  const nextStatus = STATUS_FLOW[currentStatus];
  const isCancellable = CANCELLABLE_STATUSES.has(currentStatus);

  async function handleAdvanceStatus() {
    if (!orderId || !nextStatus) return;
    await updateStatus({ orderId, status: nextStatus });
  }

  async function handleCancelOrder() {
    if (!orderId) return;
    await updateStatus({ orderId, status: "cancelled" });
  }

  async function handlePaymentStatusChange(newStatus: string) {
    if (!orderId) return;
    await updatePaymentStatus({ orderId, paymentStatus: newStatus });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Package className="size-5" />
            {order ? `Order #${order._id.slice(-6).toUpperCase()}` : "Order Details"}
          </SheetTitle>
          <SheetDescription>
            {order ? formatDate(order._creationTime) : "Loading order details..."}
          </SheetDescription>
        </SheetHeader>

        {isLoading && (
          <div className="flex flex-1 items-center justify-center py-20">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {order && (
          <div className="flex flex-col gap-4 px-4 pb-6">
            {/* Status Stepper */}
            <OrderStatusStepper currentStatus={currentStatus} />

            {/* Quick Actions */}
            {currentStatus !== "delivered" && currentStatus !== "cancelled" && (
              <div className="flex gap-2">
                {nextStatus && (
                  <Button className="flex-1" onClick={handleAdvanceStatus}>
                    {NEXT_STATUS_LABELS[currentStatus]}
                    <ArrowRight className="size-4" />
                  </Button>
                )}
                {isCancellable && (
                  <Button variant="destructive" size="icon" onClick={handleCancelOrder}>
                    <XCircle className="size-4" />
                  </Button>
                )}
              </div>
            )}

            <Separator />

            {/* Order Info */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="size-4" />
              <span>{formatDate(order._creationTime)}</span>
              {order.source && (
                <Badge variant="outline" className="ml-auto gap-1">
                  {order.source === "mobile" ? (
                    <Smartphone className="size-3" />
                  ) : (
                    <Globe className="size-3" />
                  )}
                  {order.source}
                </Badge>
              )}
              {order.orderType && (
                <Badge variant="secondary">{order.orderType}</Badge>
              )}
            </div>

            {/* Items Section */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Package className="size-4" />
                  Items ({order.itemCount})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {order.items?.map((item: OrderItem, index: number) => (
                  <div key={index} className="flex flex-col gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <Badge variant="secondary" className="mt-0.5 shrink-0 text-xs">
                          {item.quantity}x
                        </Badge>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium">{item.menuItemName}</span>
                          {item.variation && (
                            <span className="text-xs text-muted-foreground">{item.variation}</span>
                          )}
                          {item.variationSelections != null && (
                            <span className="text-xs text-muted-foreground">
                              {formatVariationSelections(item.variationSelections)}
                            </span>
                          )}
                          {item.addons != null && (
                            <span className="text-xs text-muted-foreground">
                              + {formatAddons(item.addons)}
                            </span>
                          )}
                          {item.specialInstructions && (
                            <span className="text-xs italic text-amber-600">
                              &quot;{item.specialInstructions}&quot;
                            </span>
                          )}
                          {item.isBundleItem && item.bundleName && (
                            <Badge variant="outline" className="w-fit text-[10px]">
                              {item.bundleName}
                              {item.slotName ? ` - ${item.slotName}` : ""}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-medium">
                        {formatCurrency(item.subtotal)}
                      </span>
                    </div>
                    {index < (order.items?.length ?? 0) - 1 && <Separator className="mt-2" />}
                  </div>
                ))}

                <Separator />

                {order.deliveryFee != null && order.deliveryFee > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Delivery Fee</span>
                    <span>{formatCurrency(order.deliveryFee)}</span>
                  </div>
                )}

                <div className="flex items-center justify-between font-semibold">
                  <span>Total</span>
                  <span className="text-base">{formatCurrency(order.total)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Customer Section */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <User className="size-4" />
                  Customer
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-sm font-medium">{order.customerName}</div>
                {order.customerContact && (
                  <a
                    href={`tel:${order.customerContact}`}
                    className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                  >
                    <Phone className="size-3.5" />
                    {order.customerContact}
                  </a>
                )}
                {order.customerData && typeof order.customerData === "object" && (
                  <div className="mt-2 space-y-1 rounded-md bg-muted/50 p-2">
                    {Object.entries(order.customerData as Record<string, unknown>).map(
                      ([key, value]) => (
                        <div key={key} className="flex justify-between text-xs">
                          <span className="text-muted-foreground capitalize">
                            {key.replace(/_/g, " ")}
                          </span>
                          <span>{String(value)}</span>
                        </div>
                      )
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Delivery Section (Conditional) */}
            {order.deliveryAddress && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Truck className="size-4" />
                    Delivery
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span>{order.deliveryAddress}</span>
                  </div>
                  {order.lalamoveStatus && (
                    <div className="space-y-1.5 rounded-md bg-muted/50 p-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Status</span>
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
                          <a
                            href={`tel:${order.lalamoveDriverPhone}`}
                            className="text-blue-600 hover:underline"
                          >
                            {order.lalamoveDriverPhone}
                          </a>
                        </div>
                      )}
                      {order.lalamoveTrackingUrl && (
                        <a
                          href={order.lalamoveTrackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                          <Globe className="size-3" />
                          Track Delivery
                        </a>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Payment Section */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CreditCard className="size-4" />
                  Payment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {order.paymentMethod && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Method</span>
                    <span className="font-medium">{order.paymentMethod}</span>
                  </div>
                )}
                {order.paymentMethodDetails && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Details</span>
                    <span className="text-right text-xs">{order.paymentMethodDetails}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <Select
                    value={order.paymentStatus ?? "pending"}
                    onValueChange={handlePaymentStatusChange}
                  >
                    <SelectTrigger size="sm" className="w-auto gap-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["pending", "paid", "verified", "failed"].map((status) => (
                        <SelectItem key={status} value={status}>
                          <span
                            className={`capitalize ${PAYMENT_STATUS_COLORS[status] ?? ""}`}
                          >
                            {status}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// -- Helpers for formatting item details --

interface OrderItem {
  menuItemName: string;
  quantity: number;
  price: number;
  subtotal: number;
  variation?: string;
  variationSelections?: unknown;
  addons?: unknown;
  specialInstructions?: string;
  isBundleItem?: boolean;
  bundleName?: string;
  slotName?: string;
}

function formatVariationSelections(selections: unknown): string {
  if (!selections || typeof selections !== "object") return "";
  if (Array.isArray(selections)) {
    return selections
      .map((s: Record<string, unknown>) => {
        const typeName = s.typeName ?? s.type ?? "";
        const optionName = s.optionName ?? s.option ?? s.name ?? "";
        return typeName ? `${typeName}: ${optionName}` : String(optionName);
      })
      .join(", ");
  }
  return Object.entries(selections as Record<string, unknown>)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(", ");
}

function formatAddons(addons: unknown): string {
  if (!addons) return "";
  if (Array.isArray(addons)) {
    return addons
      .map((a: Record<string, unknown>) => {
        const name = a.name ?? a.addonName ?? "";
        return String(name);
      })
      .filter(Boolean)
      .join(", ");
  }
  return String(addons);
}
