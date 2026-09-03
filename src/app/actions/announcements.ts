'use server'

/**
 * Superadmin server actions for platform "What's New" announcements.
 *
 * Server Actions are public POST endpoints whatever the page gate says, so
 * every one asserts the superadmin role itself before touching the
 * service-role client. Input crosses the boundary as `unknown` and is parsed
 * by the shared content model before it reaches the database.
 */
import { revalidatePath } from 'next/cache'
import { getCurrentUserRole } from '@/lib/admin-service'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { parseAnnouncementInput } from '@/lib/announcements/blocks'
import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncement,
  listAnnouncements,
  listAudienceTenants,
  setAnnouncementStatus,
  updateAnnouncement,
  type AnnouncementRecord,
  type AnnouncementStatus,
  type AnnouncementSummary,
  type AudienceTenant,
} from '@/lib/announcements/service'
import {
  countAnnouncementRecipients,
  sendAnnouncementPush,
  type AnnouncementSendResult,
} from '@/lib/push/send-announcement'

const LIST_PATH = '/superadmin/whats-new'

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

export async function listAnnouncementsAction(): Promise<AnnouncementSummary[]> {
  await assertSuperadmin()
  return listAnnouncements(createAdminClient())
}

export async function getAnnouncementAction(id: string): Promise<AnnouncementRecord | null> {
  await assertSuperadmin()
  return getAnnouncement(createAdminClient(), id)
}

export async function listAudienceTenantsAction(): Promise<AudienceTenant[]> {
  await assertSuperadmin()
  return listAudienceTenants(createAdminClient())
}

export async function saveAnnouncementAction(
  id: string | null,
  input: unknown
): Promise<AnnouncementRecord> {
  await assertSuperadmin()
  const parsed = parseAnnouncementInput(input)
  if (!parsed.ok) throw new Error(parsed.error)

  const admin = createAdminClient()
  const saved = id
    ? await updateAnnouncement(admin, id, parsed.input)
    : await createAnnouncement(admin, parsed.input, await currentUserId())
  revalidatePath(LIST_PATH)
  return saved
}

export async function setAnnouncementStatusAction(
  id: string,
  status: AnnouncementStatus
): Promise<AnnouncementRecord> {
  await assertSuperadmin()
  const updated = await setAnnouncementStatus(createAdminClient(), id, status)
  revalidatePath(LIST_PATH)
  return updated
}

export async function deleteAnnouncementAction(id: string): Promise<void> {
  await assertSuperadmin()
  await deleteAnnouncement(createAdminClient(), id)
  revalidatePath(LIST_PATH)
}

export async function countAnnouncementRecipientsAction(
  audienceTenantIds: string[] | null
): Promise<number> {
  await assertSuperadmin()
  return countAnnouncementRecipients(createAdminClient(), audienceTenantIds)
}

export async function sendAnnouncementPushAction(id: string): Promise<AnnouncementSendResult> {
  await assertSuperadmin()
  const result = await sendAnnouncementPush(createAdminClient(), id)
  revalidatePath(LIST_PATH)
  return result
}
