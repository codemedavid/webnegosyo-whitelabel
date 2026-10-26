/**
 * Where a delivery starts: the branch the order belongs to when that branch
 * is pinned, else the store. Until 2026-10 every quote, fee and Lalamove
 * pickup used the store's pin, so a branch's riders were sent to the main shop.
 *
 * Pure. Callers read the branch on the SERVER (never take a client's
 * coordinates) and check it belongs to the store before passing it in.
 */

import { toLatLng, type LatLng } from '@/lib/delivery-fee'

export interface OriginStoreFields {
  restaurant_address?: string | null
  restaurant_latitude?: string | number | null
  restaurant_longitude?: string | number | null
  delivery_radius_km?: string | number | null
}

export interface OriginOutletFields {
  id: string
  address?: string | null
  latitude?: number | string | null
  longitude?: number | string | null
  delivery_radius_km?: number | string | null
}

export interface DeliveryOrigin {
  source: 'outlet' | 'store'
  outletId: string | null
  address: string
  point: LatLng
  radiusKm: number | null
}

/** `toLatLng`, but 0,0 (an unset pin some writers stored) is no pin. */
export function usablePin(lat: unknown, lng: unknown): LatLng | null {
  const point = toLatLng(lat, lng)
  if (!point || (point.lat === 0 && point.lng === 0)) return null
  return point
}

function radius(value: unknown): number | null {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function text(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function resolveDeliveryOrigin(
  store: OriginStoreFields,
  outlet: OriginOutletFields | null | undefined,
): DeliveryOrigin | null {
  const storeRadius = radius(store.delivery_radius_km)
  const outletPoint = outlet ? usablePin(outlet.latitude, outlet.longitude) : null
  if (outlet && outletPoint) {
    return {
      source: 'outlet',
      outletId: outlet.id,
      address: text(outlet.address) || text(store.restaurant_address),
      point: outletPoint,
      radiusKm: radius(outlet.delivery_radius_km) ?? storeRadius,
    }
  }
  const storePoint = usablePin(store.restaurant_latitude, store.restaurant_longitude)
  if (!storePoint) return null
  return { source: 'store', outletId: null, address: text(store.restaurant_address), point: storePoint, radiusKm: storeRadius }
}
