'use server'

/**
 * Superadmin server actions for the merchant app's release policy.
 *
 * Server Actions are public POST endpoints whatever the page gate says, so
 * each one asserts its console grant (`app_releases.*`) before touching the
 * service-role client. Input crosses the boundary as `unknown` and is parsed
 * before it reaches the database — this row raises a blocking wall in front
 * of every merchant, so it is not a place to trust a submitted shape.
 */
import { revalidatePath } from 'next/cache'
import { requirePlatformPermission } from '@/lib/platform-staff/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseAppReleaseInput } from '@/lib/app-releases/input'
import {
  listAppReleases,
  saveAppRelease,
  type AppReleaseRecord,
} from '@/lib/app-releases/service'

const LIST_PATH = '/superadmin/app-releases'

export async function listAppReleasesAction(): Promise<AppReleaseRecord[]> {
  await requirePlatformPermission('app_releases.view')
  return listAppReleases(createAdminClient())
}

export async function saveAppReleaseAction(input: unknown): Promise<AppReleaseRecord> {
  const caller = await requirePlatformPermission('app_releases.edit')
  const parsed = parseAppReleaseInput(input)
  if (!parsed.ok) throw new Error(parsed.error)

  const saved = await saveAppRelease(createAdminClient(), parsed.input, caller.user.id)
  revalidatePath(LIST_PATH)
  return saved
}
