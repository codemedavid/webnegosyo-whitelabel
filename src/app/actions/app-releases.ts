'use server'

/**
 * Superadmin server actions for the merchant app's release policy.
 *
 * Server Actions are public POST endpoints whatever the page gate says, so
 * each one asserts the superadmin role itself before touching the
 * service-role client. Input crosses the boundary as `unknown` and is parsed
 * before it reaches the database — this row raises a blocking wall in front
 * of every merchant, so it is not a place to trust a submitted shape.
 */
import { revalidatePath } from 'next/cache'
import { getCurrentUserRole } from '@/lib/admin-service'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { parseAppReleaseInput } from '@/lib/app-releases/input'
import {
  listAppReleases,
  saveAppRelease,
  type AppReleaseRecord,
} from '@/lib/app-releases/service'

const LIST_PATH = '/superadmin/app-releases'

async function assertSuperadmin(): Promise<void> {
  const role = (await getCurrentUserRole()) as { role?: string } | null
  if (!role || role.role !== 'superadmin') {
    throw new Error('Forbidden: Superadmin access required')
  }
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

export async function listAppReleasesAction(): Promise<AppReleaseRecord[]> {
  await assertSuperadmin()
  return listAppReleases(createAdminClient())
}

export async function saveAppReleaseAction(input: unknown): Promise<AppReleaseRecord> {
  await assertSuperadmin()
  const parsed = parseAppReleaseInput(input)
  if (!parsed.ok) throw new Error(parsed.error)

  const saved = await saveAppRelease(createAdminClient(), parsed.input, await currentUserId())
  revalidatePath(LIST_PATH)
  return saved
}
