/**
 * The delivery fee the register SUGGESTS for a pinned address.
 *
 * The real figure comes from the web app (`/api/maps/delivery-quote`), which
 * runs the storefront checkout's own pricing: ROAD distance from the store's
 * pin, `fee = max(minFee, km × perKm)`. So a phoned-in delivery costs what the
 * same door costs online. This module turns that quote into a suggestion —
 * applying the store's free-delivery minimum, which depends on the cart — and,
 * when the web app cannot be reached, produces a clearly-labelled ESTIMATE the
 * same way the web's own fallback does (straight line × 1.3).
 *
 * Always a suggestion: the cashier can type their own fee, and an address
 * outside the delivery area is flagged rather than refused.
 */

import { round2 } from "./pos-cart";
import type { DeliveryPricingSetup, LatLng } from "./pos-checkout-fields";

const EARTH_RADIUS_KM = 6371;
/** Same factor as the web's last-resort road estimate (`road-distance.ts`). */
export const ROAD_ESTIMATE_FACTOR = 1.3;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export function haversineDistanceKm(from: LatLng, to: LatLng): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** A quote before the free-delivery minimum — what the web route returns. */
export interface RoadDeliveryQuote {
  fee: number;
  distanceKm: number;
  withinRadius: boolean;
  radiusKm: number;
}

export interface DeliveryFeeSuggestion {
  /** Pesos to charge; 0 when the order qualifies for free delivery. */
  fee: number;
  distanceKm: number;
  isWithinRadius: boolean;
  radiusKm: number;
  /** True when the free-delivery minimum waived the fee. */
  isFree: boolean;
  /** True for the offline estimate rather than the store's road quote. */
  isEstimate: boolean;
}

/**
 * True when the store prices delivery by distance and the register can ask
 * for a quote at all. Lalamove stores quote through Lalamove instead.
 */
export function canSuggestDeliveryFee(setup: DeliveryPricingSetup): boolean {
  return setup.store !== null && setup.distance !== null && !setup.isLalamove;
}

/** The store's free-delivery minimum, applied to a quote. */
export function toSuggestion(
  quote: RoadDeliveryQuote,
  setup: DeliveryPricingSetup,
  itemsSubtotal: number,
  isEstimate = false,
): DeliveryFeeSuggestion {
  const isFree = setup.freeDeliveryMin !== null && itemsSubtotal >= setup.freeDeliveryMin;
  return {
    fee: isFree ? 0 : round2(quote.fee),
    distanceKm: quote.distanceKm,
    isWithinRadius: quote.withinRadius,
    radiusKm: quote.radiusKm,
    isFree,
    isEstimate,
  };
}

/**
 * The offline stand-in: straight line × {@link ROAD_ESTIMATE_FACTOR}, priced
 * with the store's own rate. Null when there is nothing to price.
 */
export function estimateDeliveryQuote(
  setup: DeliveryPricingSetup,
  destination: LatLng | null | undefined,
): RoadDeliveryQuote | null {
  if (!destination || !setup.store || !setup.distance || setup.isLalamove) return null;

  const { perKm, minFee, radiusKm } = setup.distance;
  const straightKm = haversineDistanceKm(setup.store, destination);
  const distanceKm = straightKm * ROAD_ESTIMATE_FACTOR;
  return {
    fee: round2(Math.max(minFee, distanceKm * perKm)),
    distanceKm,
    withinRadius: distanceKm <= radiusKm,
    radiusKm,
  };
}

/** Validates the web route's answer; null for anything malformed. */
export function parseRoadDeliveryQuote(value: unknown): RoadDeliveryQuote | null {
  if (typeof value !== "object" || value === null) return null;
  const { fee, distanceKm, withinRadius, radiusKm } = value as Record<string, unknown>;
  const isFiniteNumber = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  if (!isFiniteNumber(fee) || fee < 0) return null;
  if (!isFiniteNumber(distanceKm) || distanceKm < 0) return null;
  if (!isFiniteNumber(radiusKm) || typeof withinRadius !== "boolean") return null;
  return { fee, distanceKm, withinRadius, radiusKm };
}

/** "850 m" under a kilometre, "3.2 km" above. */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}
