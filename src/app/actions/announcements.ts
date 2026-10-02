'use server'

/**
 * Superadmin server actions for platform "What's New" announcements.
 *
 * Server Actions are public POST endpoints whatever the page gate says, so
 * every one asserts its console grant (`whats_new.*`) before touching the
 * service-role client. Input crosses the boundary as `unknown` and is parsed
 * by the shared content model before it reaches the database.
 */
import { revalidatePath } from 'next/cache'
import { requirePlatformPermission } from '@/lib/platform-staff/guard'
import { createAdminClient } from '@/lib/supabase/admin'
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

export async function listAnnouncementsAction(): Promise<AnnouncementSummary[]> {
  await requirePlatformPermission('whats_new.view')
  return listAnnouncements(createAdminClient())
}

export async function getAnnouncementAction(id: string): Promise<AnnouncementRecord | null> {
  await requirePlatformPermission('whats_new.view')
  return getAnnouncement(createAdminClient(), id)
}

export async function listAudienceTenantsAction(): Promise<AudienceTenant[]> {
  await requirePlatformPermission('whats_new.view')
  return listAudienceTenants(createAdminClient())
}

export async function saveAnnouncementAction(
  id: string | null,
  input: unknown
): Promise<AnnouncementRecord> {
  const caller = await requirePlatformPermission(id ? 'whats_new.edit' : 'whats_new.create')
  const parsed = parseAnnouncementInput(input)
  if (!parsed.ok) throw new Error(parsed.error)

  const admin = createAdminClient()
  const saved = id
    ? await updateAnnouncement(admin, id, parsed.input)
    : await createAnnouncement(admin, parsed.input, caller.user.id)
  revalidatePath(LIST_PATH)
  return saved
}

export async function setAnnouncementStatusAction(
  id: string,
  status: AnnouncementStatus
): Promise<AnnouncementRecord> {
  await requirePlatformPermission('whats_new.edit')
  const updated = await setAnnouncementStatus(createAdminClient(), id, status)
  revalidatePath(LIST_PATH)
  return updated
}

export async function deleteAnnouncementAction(id: string): Promise<void> {
  await requirePlatformPermission('whats_new.delete')
  await deleteAnnouncement(createAdminClient(), id)
  revalidatePath(LIST_PATH)
}

export async function countAnnouncementRecipientsAction(
  audienceTenantIds: string[] | null
): Promise<number> {
  await requirePlatformPermission('whats_new.view')
  return countAnnouncementRecipients(createAdminClient(), audienceTenantIds)
}

export async function sendAnnouncementPushAction(id: string): Promise<AnnouncementSendResult> {
  await requirePlatformPermission('whats_new.edit')
  const result = await sendAnnouncementPush(createAdminClient(), id)
  revalidatePath(LIST_PATH)
  return result
}
