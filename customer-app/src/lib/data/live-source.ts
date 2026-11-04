import * as Application from 'expo-application'
import { AppApiError, createAppClient, type AppClient } from '@/lib/api/app-client'
import { resolveApplicationId } from '@/lib/api/tenant-identity'
import { withSession } from '@/lib/auth/session-guard'
import {
  appCatalogSchema,
  appConfigSchema,
  appDeliveryQuoteSchema,
  appOrderDetailSchema,
  appOrderPageSchema,
  appPlacesResultSchema,
  appVoucherPreviewSchema,
} from '@/lib/contract'
import type { AppDataSource } from './source'

/** Everything that is real once an API URL is set; loyalty stays prototype until its phase. */
export type LiveSource = Omit<AppDataSource, 'getLoyalty'>

const query = (params: Record<string, string | null | undefined>) => {
  const pairs = Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '')
  return pairs.length === 0 ? '' : `?${pairs.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')}`
}

/** The platform's /api/app/v1 routes for the build this app is. Per-customer calls run as the signed-in session. */
export function createLiveSource(client: AppClient): LiveSource {
  return {
    getConfig: () => client.get('/api/app/v1/config', appConfigSchema),
    getCatalog: (outletId) => client.get(`/api/app/v1/catalog${query({ outletId })}`, appCatalogSchema),
    getOrders: (cursor) => withSession((token) => client.get(`/api/app/v1/me/orders${query({ cursor })}`, appOrderPageSchema, { token })),
    getOrder: (orderId) => withSession((token) => client.get(`/api/app/v1/orders/${encodeURIComponent(orderId)}`, appOrderDetailSchema, { token })),
    placeOrder: (draft, idempotencyKey) =>
      withSession((token) =>
        client.send('POST', '/api/app/v1/orders', appOrderDetailSchema, { body: draft, token, headers: { 'Idempotency-Key': idempotencyKey } }),
      ),
    previewVoucher: (request) =>
      withSession((token) => client.send('POST', '/api/app/v1/vouchers/preview', appVoucherPreviewSchema, { body: request, token })).catch(
        (error: unknown) => {
          // An unknown code is an answer ("not a code here"), not a failure.
          if (error instanceof AppApiError && error.code === 'not_found') return null
          throw error
        },
      ),
    quoteDelivery: (request) =>
      withSession((token) => client.send('POST', '/api/app/v1/delivery/quote', appDeliveryQuoteSchema, { body: request, token })),
    searchPlaces: async ({ q, outletId }) => {
      const result = await withSession((token) =>
        client.get(`/api/app/v1/places${query({ q, outletId })}`, appPlacesResultSchema, { token }),
      )
      return result.places
    },
  }
}

let sharedClient: AppClient | null | undefined

/** The one /api/app/v1 client for this build, or null when `EXPO_PUBLIC_APP_API_URL` is unset (fixtures). */
export function appClientFromEnv(): AppClient | null {
  if (sharedClient !== undefined) return sharedClient
  const baseUrl = process.env.EXPO_PUBLIC_APP_API_URL?.trim()
  sharedClient = baseUrl ? createAppClient({ baseUrl, applicationId: resolveApplicationId(Application.applicationId) }) : null
  return sharedClient
}

/** `EXPO_PUBLIC_APP_API_URL` switches the app from fixtures to the real store. */
export function liveSourceFromEnv(): LiveSource | null {
  const client = appClientFromEnv()
  return client ? createLiveSource(client) : null
}
