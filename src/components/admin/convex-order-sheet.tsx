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
  CalendarClock,
  Store,
  Printer,
} from "lucide-react";
import { useState } from "react";
import { getReceiptContext } from "@/app/actions/receipt";
import { renderReceipt, resolveReceiptLayout, type ReceiptOrder } from "@/lib/receipt-layout";
import { openReceiptPrintWindow } from "@/lib/receipt-web";
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
import { getOrderScheduledLabel } from "@/lib/advance-order-utils";
import { getOrderOutletLabel } from "@/lib/outlets/order-outlet-display";
import {
  useConvexOrderById,
  useUpdateConvexOrderStatus,
  useUpdateConvexPaymentStatus,
} from "@/hooks/use-convex-orders";
import { restoreOrderStockAction } from "@/app/actions/inventory";
import { notifyConvexLifecycleSync } from "@/lib/customers/web-lifecycle-sync";
import { visibleCustomerFields } from "@/lib/admin/order-customer-fields";
import { releasePresellForCancelledConvexOrderAction } from "@/app/actions/presell";
import { orderSummaryRows } from "@/lib/order-summary-rows";
import { readOrderDiscount } from "@/lib/order-discount";
import { displayCustomerName } from '@/lib/order-display-name'
import { ConvexLalamovePanel } from "@/components/admin/convex-lalamove-panel";
import { shouldShowLalamoveControls } from "@/lib/lalamove-order-visibility";

interface ConvexOrderSheetProps {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Needed to restore stock on cancellation. Optional so the sheet still
   * renders for callers that have no tenant context; those simply skip the
   * restore rather than fail to open.
   */
  tenantId?: string;
  /**
   * The tenant's `lalamove_enabled` flag. Convex orders carried their
   * Lalamove status read-only here; the booking controls need to know the
   * store actually has Lalamove before offering a rider.
   */
  lalamoveEnabled?: boolean;
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

export function ConvexOrderSheet({
  orderId,
  open,
  onOpenChange,
  tenantId,
  lalamoveEnabled = false,
}: ConvexOrderSheetProps) {
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
    // Convex holds the order; the platform holds the customer ledger loyalty
    // earns from. Nothing else in the browser tells it this order moved.
    void notifyConvexLifecycleSync({ tenantId, externalOrderId: orderId, status: nextStatus });
  }

  async function handleCancelOrder() {
    if (!orderId) return;
    await updateStatus({ orderId, status: "cancelled" });
    // A cancellation reverses the visit — and the stamp it earned.
    void notifyConvexLifecycleSync({ tenantId, externalOrderId: orderId, status: "cancelled" });

    // Put the ingredients back. This order lives in Convex, so cancelling it
    // never reaches updateOrderStatus where stock is restored for
    // platform-backed orders. Best-effort underneath: the cancellation has
    // already happened and must not be undone by a stock write.
    if (tenantId) {
      await restoreOrderStockAction(tenantId, orderId);
      // The pre-order dates this order held go back on sale too. The claim
      // rides in customerData, so no lookup is needed.
      await releasePresellForCancelledConvexOrderAction(tenantId, order?.customerData);
    }
  }

  const [isPrintingReceipt, setIsPrintingReceipt] = useState(false);

  // Browser print of the same block layout the thermal printer uses. Convex
  // orders already carry the engine's field names, so no mapping is needed.
  async function handlePrintReceipt() {
    if (!order || !tenantId) return;
    setIsPrintingReceipt(true);
    try {
      const context = await getReceiptContext(tenantId);
      const text = renderReceipt(
        order as unknown as ReceiptOrder,
        { storeName: context?.storeName ?? "Store" },
        resolveReceiptLayout(context?.receiptLayout ?? null),
      );
      openReceiptPrintWindow(text);
    } finally {
      setIsPrintingReceipt(false);
    }
  }

  async function handlePaymentStatusChange(newStatus: string) {
    if (!orderId) return;
    await updatePaymentStatus({ orderId, paymentStatus: newStatus });
    // A counter sale earns at SETTLEMENT, not at delivery.
    void notifyConvexLifecycleSync({ tenantId, externalOrderId: orderId, paymentStatus: newStatus });
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

            {tenantId && (
              <Button
                variant="outline"
                className="w-full"
                onClick={handlePrintReceipt}
                disabled={isPrintingReceipt}
              >
                <Printer className="size-4" />
                {isPrintingReceipt ? "Preparing…" : "Print receipt"}
              </Button>
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

            {/* Scheduled / Pre-order Banner */}
            {(() => {
              const scheduledLabel = getOrderScheduledLabel({
                scheduled_for: (order.scheduledFor ?? null) as string | null,
                customer_data: (order.customerData ?? null) as Record<string, unknown> | null,
              });
              return scheduledLabel ? (
                <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-100 px-3 py-2 text-amber-900">
                  <CalendarClock className="size-5 shrink-0" />
                  <span className="text-sm font-semibold">
                    Pre-order · Scheduled for {scheduledLabel}
                  </span>
                </div>
              ) : null;
            })()}

            {/* Branch that took the order (multi-branch tenants only) */}
            {(() => {
              const outletLabel = getOrderOutletLabel({
                customer_data: (order.customerData ?? null) as Record<string, unknown> | null,
              });
              return outletLabel ? (
                <div className="flex items-center gap-2 rounded-md border border-violet-300 bg-violet-100 px-3 py-2 text-violet-900">
                  <Store className="size-5 shrink-0" />
                  <span className="text-sm font-semibold">Branch · {outletLabel}</span>
                </div>
              ) : null;
            })()}

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

                {/*
                  Without the discount rows the item lines above visibly failed
                  to add up to the total, and nothing accounted for the gap.
                  Convex orders carry the breakdown in `customerData`, which is
                  what `readOrderDiscount` shape-checks.
                */}
                {orderSummaryRows({
                  subtotal: (order.items ?? []).reduce(
                    (sum: number, item: OrderItem) => sum + Number(item.subtotal ?? 0),
                    0,
                  ),
                  deliveryFee: order.deliveryFee,
                  discount: readOrderDiscount(order),
                  total: order.total,
                }).map((row, index) =>
                  row.kind === 'total' ? (
                    <div
                      key={`${row.kind}-${index}`}
                      className="flex items-center justify-between font-semibold"
                    >
                      <span>Total</span>
                      <span className="text-base">{formatCurrency(row.amount)}</span>
                    </div>
                  ) : (
                    <div
                      key={`${row.kind}-${index}`}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-muted-foreground">{row.label}</span>
                      <span
                        className={
                          row.kind === 'discount'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : undefined
                        }
                      >
                        {row.kind === 'discount' ? '−' : ''}
                        {formatCurrency(row.amount)}
                      </span>
                    </div>
                  ),
                )}
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
                <div className="text-sm font-medium">{displayCustomerName(order.customerName)}</div>
                {order.customerContact && (
                  <a
                    href={`tel:${order.customerContact}`}
                    className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                  >
                    <Phone className="size-3.5" />
                    {order.customerContact}
                  </a>
                )}
                {visibleCustomerFields(order.customerData).length > 0 && (
                  <div className="mt-2 space-y-1 rounded-md bg-muted/50 p-2">
                    {visibleCustomerFields(order.customerData).map((field) => (
                      <div key={field.key} className="flex justify-between text-xs">
                        <span className="text-muted-foreground capitalize">
                          {field.label}
                        </span>
                        <span>{field.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Delivery Section (Conditional) */}
            {(order.deliveryAddress || shouldShowLalamoveControls(order)) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Truck className="size-4" />
                    Delivery
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {order.deliveryAddress && (
                    <div className="flex items-start gap-2 text-sm">
                      <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      <span>{order.deliveryAddress}</span>
                    </div>
                  )}
                  <ConvexLalamovePanel order={order} lalamoveEnabled={lalamoveEnabled} />
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
