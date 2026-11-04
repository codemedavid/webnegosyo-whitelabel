'use server'

/**
 * "Is your pin where your address says?" — asked before a store or branch
 * location is saved (delivery settings, branches, superadmin).
 *
 * Read-only and advisory: it geocodes the typed address with the Apple Maps
 * Server API and reports how far the pin is from it. It never changes the pin.
 * Any failure (no Apple key, Apple down, a slow answer) answers "no mismatch",
 * so the check can never block a save.
 */

import { z } from 'zod'
import { verifySuperadmin, verifyTenantAdmin } from '@/lib/admin-service'
import { storePinAddressMismatchKm } from '@/lib/delivery/store-pin-address-check'
import { createAppleMapsClient } from '@/lib/maps/apple/maps-server-api'
import { readMapKitConfig } from '@/lib/maps/apple/mapkit-token'

/** A settings save waits on this, so it gives up quickly. */
const GEOCODE_TIMEOUT_MS = 3_000
const MAX_ADDRESS_LENGTH = 500

const inputSchema = z.object({
  tenantId: z.string().uuid().nullable(),
  address: z.string().trim().min(1).max(MAX_ADDRESS_LENGTH),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
})

export interface StorePinAddressCheck {
  /** Km between the pin and the typed address, when they disagree; null otherwise. */
  mismatchKm: number | null
}

export async function checkStorePinAddressAction(
  tenantId: string | null,
  address: string,
  latitude: number,
  longitude: number,
): Promise<StorePinAddressCheck> {
  // A new store has no id yet: only a superadmin creates one.
  if (tenantId) await verifyTenantAdmin(tenantId)
  else await verifySuperadmin()

  const parsed = inputSchema.safeParse({ tenantId, address, latitude, longitude })
  if (!parsed.success) return { mismatchKm: null }

  const config = readMapKitConfig()
  if (!config) return { mismatchKm: null }

  try {
    const client = createAppleMapsClient(config, undefined, { timeoutMs: GEOCODE_TIMEOUT_MS })
    const places = await client.geocode(parsed.data.address)
    return { mismatchKm: storePinAddressMismatchKm({ lat: parsed.data.latitude, lng: parsed.data.longitude }, places) }
  } catch (error) {
    console.error('[store-pin] address geocode failed:', error)
    return { mismatchKm: null }
  }
}
