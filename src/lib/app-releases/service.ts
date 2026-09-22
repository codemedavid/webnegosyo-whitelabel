/**
 * Reads and writes for the merchant app's release policy.
 *
 * Like the announcements service, every function takes the client it should
 * use, so the server actions hand in the service-role client (superadmin-only
 * surface, authorization already asserted) and tests can hand in a fake.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import type { AppReleaseInput, AppReleasePlatform } from './input'

type Client = SupabaseClient<Database>
type AppReleaseRow = Database['public']['Tables']['platform_app_releases']['Row']

export interface AppReleaseRecord {
  platform: AppReleasePlatform
  latestVersion: string
  minimumVersion: string
  storeUrl: string
  releaseNotes: string | null
  updatedAt: string
}

function toRecord(row: AppReleaseRow): AppReleaseRecord {
  return {
    platform: row.platform === 'ios' ? 'ios' : 'android',
    latestVersion: row.latest_version,
    minimumVersion: row.minimum_version,
    storeUrl: row.store_url,
    releaseNotes: row.release_notes,
    updatedAt: row.updated_at,
  }
}

/** Both platforms' policies, iOS first. */
export async function listAppReleases(client: Client): Promise<AppReleaseRecord[]> {
  const { data, error } = await client
    .from('platform_app_releases')
    .select('*')
    .order('platform', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(toRecord)
}

/**
 * Writes one platform's policy. Upsert rather than update: a platform with no
 * row yet is a policy that has never been set, not an error.
 */
export async function saveAppRelease(
  client: Client,
  input: AppReleaseInput,
  userId: string | null
): Promise<AppReleaseRecord> {
  const { data, error } = await client
    .from('platform_app_releases')
    .upsert(
      {
        platform: input.platform,
        latest_version: input.latestVersion,
        minimum_version: input.minimumVersion,
        store_url: input.storeUrl,
        release_notes: input.releaseNotes,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'platform' }
    )
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return toRecord(data as AppReleaseRow)
}
