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

/** `EXPO_PUBLIC_APP_API_URL` switches the app from fixtures to the real store. */
export function liveReadsFromEnv(): LiveReads | null {
  const baseUrl = process.env.EXPO_PUBLIC_APP_API_URL?.trim()
  if (!baseUrl) return null
  return createLiveReads(createAppClient({ baseUrl, applicationId: resolveApplicationId(Application.applicationId) }))
}
