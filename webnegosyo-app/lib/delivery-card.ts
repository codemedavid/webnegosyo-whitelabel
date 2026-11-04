/**
 * The order screen's Delivery card: a Google Maps link to the customer's pin
 * and the words that get the rider to the door (unit, landmark, note).
 *
 * Until 2026-10 the card showed the address text only — the pin the customer
 * picked was hidden from the merchant, so a vague address could not be checked.
 */

import { classifyDetailKey, findDeliveryDetails, DELIVERY_LANDMARK_KEY, DELIVERY_RIDER_NOTE_KEY, DELIVERY_UNIT_KEY } from "./delivery-details";
import { googleMapsUrl } from "./maps/address-search";

export interface DeliveryCardLine {
  label: string;
  value: string;
}

export interface DeliveryCard {
  mapUrl: string | null;
  lines: DeliveryCardLine[];
}

export interface DeliveryCardInput {
  address: string | null | undefined;
  customerData: Record<string, unknown> | null | undefined;
  /** A Convex order's own columns; platform orders keep the pin in customerData. */
  latitude?: number | null;
  longitude?: number | null;
}

const BUILT_IN_DETAIL_KEYS = new Set([DELIVERY_UNIT_KEY, DELIVERY_LANDMARK_KEY, DELIVERY_RIDER_NOTE_KEY]);

function coordinate(value: unknown, limit: number): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Math.abs(parsed) <= limit ? parsed : null;
}

function orderPin(input: DeliveryCardInput): { lat: number; lng: number } | null {
  const data = input.customerData ?? {};
  const lat = coordinate(data.delivery_lat, 90) ?? coordinate(input.latitude, 90);
  const lng = coordinate(data.delivery_lng, 180) ?? coordinate(input.longitude, 180);
  if (lat === null || lng === null || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

export function buildDeliveryCard(input: DeliveryCardInput): DeliveryCard {
  const details = findDeliveryDetails(input.customerData);
  const lines: DeliveryCardLine[] = [
    { label: "Unit / Floor", value: details.unit },
    { label: "Landmark", value: details.landmark },
    { label: "Note to rider", value: details.riderNote },
  ].filter((line) => line.value !== "");
  return { mapUrl: googleMapsUrl(input.address ?? "", orderPin(input)), lines };
}

/** Whether a customer-detail row is one the Delivery card already shows (so it is not listed twice). */
export function isDeliveryDetailRow(key: string, customerData: Record<string, unknown> | null | undefined): boolean {
  if (BUILT_IN_DETAIL_KEYS.has(key)) return true;
  if (classifyDetailKey(key) === null) return false;
  const details = findDeliveryDetails(customerData);
  const value = customerData?.[key];
  return typeof value === "string" && [details.unit, details.landmark, details.riderNote].includes(value.trim());
}
