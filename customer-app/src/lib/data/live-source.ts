import * as Application from 'expo-application'
import { createAppClient, type AppClient } from '@/lib/api/app-client'
import { resolveApplicationId } from '@/lib/api/tenant-identity'
import { appCatalogSchema, appConfigSchema } from '@/lib/contract'
import type { LiveReads } from './fixture-source'

/** The platform's /api/app/v1 reads, for the build this app is. */
export function createLiveReads(client: AppClient): LiveReads {
  return {
    getConfig: () => client.get('/api/app/v1/config', appConfigSchema),
    getCatalog: (outletId) =>
      client.get(outletId ? `/api/app/v1/catalog?outletId=${encodeURIComponent(outletId)}` : '/api/app/v1/catalog', appCatalogSchema),
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
export function liveReadsFromEnv(): LiveReads | null {
  const client = appClientFromEnv()
  return client ? createLiveReads(client) : null
}
