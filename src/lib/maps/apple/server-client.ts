import 'server-only'
import { createAppleMapsClient, type AppleMapsClient } from './maps-server-api'
import type { MapKitConfig } from './mapkit-token'

/**
 * One Apple Maps Server API client per runtime, so Apple's 30-minute access
 * token is reused across requests (the merchant register's and the customer
 * app's address search share it). A rotated key gets a fresh client.
 */
let cachedClient: { config: MapKitConfig; client: AppleMapsClient } | null = null

export function appleMapsClientFor(config: MapKitConfig): AppleMapsClient {
  if (cachedClient?.config.keyId !== config.keyId) {
    cachedClient = { config, client: createAppleMapsClient(config) }
  }
  return cachedClient.client
}
