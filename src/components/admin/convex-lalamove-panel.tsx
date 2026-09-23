"use client";

import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/cart-utils";
import { STORE_PHONE_RECIPIENT_NOTICE } from "@/lib/lalamove-recipient";
import { shouldShowLalamoveControls } from "@/lib/lalamove-order-visibility";
import {
  isActiveLalamoveDelivery,
  isLalamoveFinal,
  isRebookableLalamoveStatus,
  lalamoveStatusTone,
  type LalamoveStatusTone,
} from "@/lib/lalamove-status";
import { useConvexLalamoveActions, type ConvexLalamoveResult } from "@/hooks/use-convex-lalamove";

/** Same cadence as the Supabase panel: driver assignment shows up unprompted. */
const AUTO_SYNC_INTERVAL_MS = 45_000;
const DEFAULT_PRIORITY_FEE = "50";
const REBOOK_CONFIRMATION =
  "Book a new Lalamove rider for this order? This gets a fresh quote and books it right away.";

const STATUS_BADGE_CLASSES: Record<LalamoveStatusTone, string> = {
  searching: "bg-orange-100 text-orange-800 border-orange-300",
  active: "bg-blue-100 text-blue-800 border-blue-300",
  done: "bg-green-100 text-green-800 border-green-300",
  cancelled: "bg-red-100 text-red-800 border-red-300",
  unknown: "bg-yellow-100 text-yellow-800 border-yellow-300",
};

/** The slice of a Convex order this panel reads. */
export interface ConvexLalamoveOrder {
  _id: string;
  orderType?: string;
  deliveryAddress?: string;
  deliveryFee?: number;
  lalamoveQuotationId?: string;
  lalamoveOrderId?: string;
  lalamoveStatus?: string;
  lalamoveDriverName?: string;
  lalamoveDriverPhone?: string;
  lalamoveTrackingUrl?: string;
}

interface ConvexLalamovePanelProps {
  order: ConvexLalamoveOrder;
  /** The tenant's `lalamove_enabled` flag, resolved on the server. */
  lalamoveEnabled: boolean;
}

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Lalamove controls for an order that lives in the tenant's Convex
 * deployment. The Convex order sheet showed delivery status read-only, so a
 * merchant on that backend could see a quotation but never book it — the
 * mobile app and the Supabase dialog both could. Every call here is one of the
 * deployment's own `lalamove:*` actions; the sheet's live query re-renders the
 * result, so there is nothing to refresh by hand.
 */
export function ConvexLalamovePanel({ order, lalamoveEnabled }: ConvexLalamovePanelProps) {
  const actions = useConvexLalamoveActions();
  const [busy, setBusy] = useState<"book" | "requote" | "rebook" | "sync" | "cancel" | "fee" | null>(null);

  const lalamoveOrderId = hasText(order.lalamoveOrderId) ? order.lalamoveOrderId : undefined;
  const lalamoveStatus = order.lalamoveStatus;
  const orderId = order._id;

  useEffect(() => {
    if (!lalamoveOrderId || !isActiveLalamoveDelivery(lalamoveStatus)) return;
    const intervalId = setInterval(() => {
      void actions.sync({ orderId }).catch(() => undefined);
    }, AUTO_SYNC_INTERVAL_MS);
    return () => clearInterval(intervalId);
    // `actions` holds stable Convex action handles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, lalamoveOrderId, lalamoveStatus]);

  if (!lalamoveEnabled || !shouldShowLalamoveControls(order)) return null;

  const hasQuotation = hasText(order.lalamoveQuotationId);
  const isFinal = isLalamoveFinal(lalamoveStatus);

  async function run(
    kind: NonNullable<typeof busy>,
    call: () => Promise<ConvexLalamoveResult>,
    onSuccess: (result: ConvexLalamoveResult) => void,
    fallback: string,
  ) {
    setBusy(kind);
    try {
      const result = await call();
      if (result.success) {
        onSuccess(result);
      } else {
        toast.error(result.error || fallback);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : fallback);
    } finally {
      setBusy(null);
    }
  }

  const reportBooked = (result: ConvexLalamoveResult) => {
    toast.success("Lalamove order created successfully!");
    if (result.recipientPhoneSource === "store") toast.info(STORE_PHONE_RECIPIENT_NOTICE);
  };

  const handleBook = () =>
    run("book", () => actions.book({ orderId }), reportBooked, "Failed to create Lalamove order");

  /**
   * Get the customer a rider again after the booking died (cancelled,
   * rejected, expired): the requote retires the dead booking, then the rider
   * is booked on the fresh quotation. A failed booking leaves the order
   * quoted, and the live query swaps in the Create/Get New Quote controls.
   */
  const handleRebook = () => {
    if (!confirm(REBOOK_CONFIRMATION)) return;
    return run(
      "rebook",
      async () => {
        const quote = await actions.requote({ orderId });
        return quote.success ? actions.book({ orderId }) : quote;
      },
      reportBooked,
      "Failed to rebook the delivery",
    );
  };

  const handleRequote = () =>
    run(
      "requote",
      () => actions.requote({ orderId }),
      (result) =>
        toast.success(
          result.price
            ? `New quotation created (${formatPrice(Number(result.price))}) — you can book the delivery now`
            : "New quotation created — you can book the delivery now",
        ),
      "Failed to create a new quotation",
    );

  const handleSync = () =>
    run("sync", () => actions.sync({ orderId }), () => toast.success("Lalamove order synced"), "Failed to sync Lalamove order");

  const handleCancel = () => {
    if (!confirm("Are you sure you want to cancel this Lalamove delivery?")) return;
    return run(
      "cancel",
      () => actions.cancel({ orderId }),
      () => toast.success("Lalamove delivery cancelled"),
      "Failed to cancel Lalamove delivery",
    );
  };

  const handlePriorityFee = () => {
    const input = window.prompt("Priority fee amount (helps match a driver faster):", DEFAULT_PRIORITY_FEE);
    if (input === null) return;
    const amount = Number(input);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    return run(
      "fee",
      () => actions.addPriorityFee({ orderId, amount: String(amount) }),
      () => toast.success(`Priority fee of ${formatPrice(amount)} added`),
      "Failed to add priority fee",
    );
  };

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        <Truck className="size-4 text-blue-600" />
        <h3 className="text-sm font-semibold text-blue-900">Lalamove Delivery</h3>
      </div>
      <div className="space-y-2 text-xs sm:text-sm">
        {Number(order.deliveryFee ?? 0) > 0 && (
          <Row label="Delivery Fee" value={formatPrice(Number(order.deliveryFee))} />
        )}
        {hasQuotation && <Row label="Quotation ID" value={order.lalamoveQuotationId!} mono />}

        {lalamoveOrderId ? (
          <>
            <Row label="Order ID" value={lalamoveOrderId} mono />
            {lalamoveStatus && (
              <div className="grid grid-cols-2 items-center gap-2">
                <span className="text-xs text-muted-foreground">Status</span>
                <div className="text-right">
                  <Badge
                    variant="outline"
                    className={`text-[10px] sm:text-xs ${STATUS_BADGE_CLASSES[lalamoveStatusTone(lalamoveStatus)]}`}
                  >
                    {lalamoveStatus}
                  </Badge>
                </div>
              </div>
            )}
            <Row
              label="Driver"
              value={
                order.lalamoveDriverName ??
                (lalamoveStatusTone(lalamoveStatus) === "searching" ? "Searching…" : "Not assigned")
              }
            />
            {order.lalamoveDriverPhone && (
              <div className="grid grid-cols-2 items-center gap-2">
                <span className="text-xs text-muted-foreground">Phone</span>
                <a href={`tel:${order.lalamoveDriverPhone}`} className="text-right text-xs text-blue-600 hover:underline">
                  {order.lalamoveDriverPhone}
                </a>
              </div>
            )}
            {order.lalamoveTrackingUrl && (
              <a
                href={order.lalamoveTrackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-1 pt-1 text-xs text-blue-600 hover:underline sm:text-sm"
              >
                <ExternalLink className="size-3" />
                Track Delivery
              </a>
            )}
            <div className="flex flex-col gap-2 pt-2">
              {isRebookableLalamoveStatus(lalamoveStatus) && (
                <>
                  <p className="text-[10px] text-muted-foreground sm:text-xs">
                    This booking ended without a delivery. Rebook to send a new rider — the
                    customer&apos;s delivery fee stays as it is.
                  </p>
                  <Button size="sm" onClick={handleRebook} disabled={busy !== null} className="w-full bg-blue-600 hover:bg-blue-700">
                    <Truck className="mr-2 size-3" />
                    {busy === "rebook" ? "Rebooking…" : "Rebook Delivery"}
                  </Button>
                </>
              )}
              <Button size="sm" variant="outline" onClick={handleSync} disabled={busy !== null} className="w-full">
                <RefreshCw className={`mr-2 size-3 ${busy === "sync" ? "animate-spin" : ""}`} />
                {busy === "sync" ? "Syncing…" : "Sync Status"}
              </Button>
              {!isFinal && (
                <Button size="sm" variant="outline" onClick={handlePriorityFee} disabled={busy !== null} className="w-full">
                  {busy === "fee" ? "Adding…" : "Add Priority Fee"}
                </Button>
              )}
              {!isFinal && (
                <Button size="sm" variant="destructive" onClick={handleCancel} disabled={busy !== null} className="w-full">
                  <X className="mr-2 size-3" />
                  {busy === "cancel" ? "Cancelling…" : "Cancel Delivery"}
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-2 pt-1">
            <p className="text-xs text-muted-foreground">
              {hasQuotation
                ? "Lalamove order has not been created yet. Book it here, or it is created automatically when the order is confirmed."
                : "This delivery has no Lalamove quotation yet. Get a quote first, then book the rider."}
            </p>
            {hasQuotation ? (
              <Button size="sm" onClick={handleBook} disabled={busy !== null} className="w-full bg-blue-600 hover:bg-blue-700">
                <Truck className="mr-2 size-3" />
                {busy === "book" ? "Creating Order…" : "Create Lalamove Order"}
              </Button>
            ) : (
              <Button size="sm" onClick={handleRequote} disabled={busy !== null} className="w-full bg-blue-600 hover:bg-blue-700">
                <RefreshCw className={`mr-2 size-3 ${busy === "requote" ? "animate-spin" : ""}`} />
                {busy === "requote" ? "Getting quote…" : "Get Lalamove Quote"}
              </Button>
            )}
            {hasQuotation && (
              <Button size="sm" variant="outline" onClick={handleRequote} disabled={busy !== null} className="w-full">
                {busy === "requote" ? "Getting new quote…" : "Get New Quote"}
              </Button>
            )}
            <p className="text-[10px] text-muted-foreground sm:text-xs">
              Quotations expire after ~5 minutes. If booking fails with an expired quotation, get a new quote first.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-2 items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`break-all text-right ${mono ? "font-mono text-[10px] sm:text-xs" : "text-xs font-medium sm:text-sm"}`}>
        {value}
      </span>
    </div>
  );
}
