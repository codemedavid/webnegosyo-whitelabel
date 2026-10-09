/**
 * Address search and map previews for the register's delivery sheet.
 *
 * The app has no native map module, so both go through the web app
 * (`/api/maps/places`, `/api/maps/snapshot`), which holds the Apple Maps key —
 * the same place search the storefront's address field uses, so "SM North" or
 * a barangay landmark finds the same spot at the counter as online.
 *
 * Every call is bounded (aborted AND raced, as `voucher-service.ts` explains)
 * and returns a result object rather than throwing: search is a convenience on
 * top of a typed address, never something a sale waits on.
 */

import { getAccessTokenBounded } from "../authorized-post";
import { getWebAppUrl } from "../web-app-url";
import type { LatLng } from "../pos-checkout-fields";
import { parseRoadDeliveryQuote, type RoadDeliveryQuote } from "../pos-delivery-quote";

export const ADDRESS_SEARCH_TIMEOUT_MS = 8_000;

export interface AddressPlace {
  name: string | null;
  address: string;
  location: LatLng;
}

export type MapsResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "offline" | "unavailable" | "busy" };

async function postMaps(path: string, body: unknown): Promise<MapsResult<unknown>> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("timeout"));
    }, ADDRESS_SEARCH_TIMEOUT_MS);
  });

  try {
    const token = await Promise.race([getAccessTokenBounded(ADDRESS_SEARCH_TIMEOUT_MS), expiry]);
    if (!token) return { ok: false, reason: "unavailable" };

    const response = await Promise.race([
      fetch(`${getWebAppUrl()}${path}`, {
        signal: controller.signal,
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }),
      expiry,
    ]);
    if (response.status === 429) return { ok: false, reason: "busy" };
    if (!response.ok) return { ok: false, reason: "unavailable" };
    return { ok: true, value: await Promise.race([response.json(), expiry]) };
  } catch {
    return { ok: false, reason: "offline" };
  } finally {
    clearTimeout(timer);
  }
}

function toPlace(raw: unknown): AddressPlace | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { name, address, lat, lng } = raw as Record<string, unknown>;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const text = typeof address === "string" ? address.trim() : "";
  const title = typeof name === "string" && name.trim() ? name.trim() : null;
  if (!text && !title) return null;
  return { name: title, address: text, location: { lat, lng } };
}

function toPlaces(value: unknown): AddressPlace[] {
  const raw = (value as { places?: unknown } | null)?.places;
  if (!Array.isArray(raw)) return [];
  return raw.map(toPlace).filter((place): place is AddressPlace => place !== null);
}

export async function searchAddresses(
  tenantId: string,
  query: string,
  near: LatLng | null,
): Promise<MapsResult<AddressPlace[]>> {
  const result = await postMaps("/api/maps/places", {
    tenantId,
    query: query.trim(),
    ...(near ? { near } : {}),
  });
  return result.ok ? { ok: true, value: toPlaces(result.value) } : result;
}

export async function fetchMapPreviewUrl(
  tenantId: string,
  at: LatLng,
  size: { width: number; height: number },
): Promise<MapsResult<string>> {
  const result = await postMaps("/api/maps/snapshot", { tenantId, at, ...size });
  if (!result.ok) return result;
  const url = (result.value as { url?: unknown } | null)?.url;
  return typeof url === "string" && url.startsWith("https://")
    ? { ok: true, value: url }
    : { ok: false, reason: "unavailable" };
}

/**
 * The fee the storefront would charge to deliver to `at` (road distance, the
 * checkout's own pricing). The free-delivery minimum is applied by the caller.
 */
export async function fetchDeliveryQuote(
  tenantId: string,
  at: LatLng,
): Promise<MapsResult<RoadDeliveryQuote>> {
  const result = await postMaps("/api/maps/delivery-quote", { tenantId, at });
  if (!result.ok) return result;
  const quote = parseRoadDeliveryQuote(result.value);
  return quote ? { ok: true, value: quote } : { ok: false, reason: "unavailable" };
}

/**
 * The address a picked place is saved as. A landmark's own address often
 * omits its name ("North Ave, Quezon City" for SM North EDSA), and the name is
 * exactly what a rider looks for, so it leads.
 */
export function placeAddressText(place: AddressPlace): string {
  if (!place.name) return place.address;
  if (!place.address) return place.name;
  return place.address.toLowerCase().startsWith(place.name.toLowerCase())
    ? place.address
    : `${place.name}, ${place.address}`;
}

/**
 * A Google Maps link for the spot: the exact pin when there is one, otherwise
 * a search for the typed address. Opens the Google Maps app when installed.
 */
export function googleMapsUrl(address: string, location: LatLng | null | undefined): string | null {
  const query = location ? `${location.lat},${location.lng}` : address.trim();
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
