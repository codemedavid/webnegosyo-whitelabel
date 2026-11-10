/**
 * What the order screen says and offers about a delivery's details. Pure.
 *
 * The server has the last word (`deliveryEditRefusal` on the web); this only
 * decides what to show, so a button isn't offered for something it would refuse.
 */

import { isRebookableLalamoveStatus } from "./lalamove-status";

const FINISHED_ORDER_STATUSES = new Set(["delivered", "cancelled", "completed"]);

export interface DeliveryFixOrder {
  status?: string | null;
  lalamoveOrderId?: string | null;
  lalamoveStatus?: string | null;
  customerData?: Record<string, unknown> | null;
  latitude?: number | null;
  longitude?: number | null;
}

/** A platform store's open order with no live rider. Convex and per-store databases have no route for this yet. */
export function canFixDelivery(order: DeliveryFixOrder, orderBackend: string | null | undefined): boolean {
  if (orderBackend !== "platform") return false;
  if (order.status && FINISHED_ORDER_STATUSES.has(order.status)) return false;
  if (order.lalamoveStatus === "BOOKING") return false;
  const hasBooking = !!order.lalamoveOrderId && order.lalamoveOrderId.trim() !== "";
  return !hasBooking || isRebookableLalamoveStatus(order.lalamoveStatus);
}

function hasCoordinate(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value));
}

function hasPin(order: DeliveryFixOrder): boolean {
  const data = order.customerData ?? {};
  return (hasCoordinate(data.delivery_lat) && hasCoordinate(data.delivery_lng)) || (hasCoordinate(order.latitude) && hasCoordinate(order.longitude));
}

/** The line that tells the merchant what to do about this order's pin, or null when there is nothing to say. */
export function deliveryPinNotice(order: DeliveryFixOrder): string | null {
  const data = order.customerData ?? {};
  if (!hasPin(order)) {
    return data.delivery_pin_skipped === "true"
      ? "The customer couldn't find their place on the map, and no delivery fee was charged. Call them for the spot and the fee, or send a pin link."
      : "This order has no pin. Set one, or send the customer a link to set it.";
  }
  const movedBy = data.delivery_pin_updated_by;
  if (movedBy !== "customer" && movedBy !== "merchant") return null;
  const who = movedBy === "customer" ? "The customer set this pin." : "This pin was changed after the order.";
  const km = typeof data.delivery_pin_km === "string" && data.delivery_pin_km ? ` It is about ${data.delivery_pin_km} km from the store.` : "";
  return `${who}${km} The delivery fee stays as it is, so change it if it should be different.`;
}
