/**
 * Reads and writes for platform "What's New" announcements.
 *
 * Every function takes the client it should use so the server actions can
 * hand in the service-role client (superadmin-only surface, authorization
 * already asserted by the action) and tests can hand in a fake. The rows are
 * mapped to camelCase records at this boundary so the composer never sees a
 * raw table row.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import {
  parseAnnouncementBlocks,
  type AnnouncementBlock,
  type AnnouncementInput,
  type AnnouncementKind,
} from './blocks'

type Client = SupabaseClient<Database>
type AnnouncementRow = Database['public']['Tables']['platform_announcements']['Row']

export type AnnouncementStatus = 'draft' | 'published'

export interface AnnouncementRecord {
  id: string
  kind: AnnouncementKind
  title: string
  summary: string | null
  coverImageUrl: string | null
  blocks: AnnouncementBlock[]
  status: AnnouncementStatus
  publishedAt: string | null
  showPopup: boolean
  audienceTenantIds: string[] | null
  pushTitle: string | null
  pushBody: string | null
  pushSentAt: string | null
  pushRecipientCount: number | null
  createdAt: string
  updatedAt: string
}

export interface AnnouncementSummary extends AnnouncementRecord {
  readCount: number
}

// The whole row: every column is shown or edited by the composer, and the
// service-role client is the only caller.
const COLUMNS = '*'

function toRecord(row: AnnouncementRow): AnnouncementRecord {
  const parsed = parseAnnouncementBlocks(row.blocks)
  return {
    id: row.id,
    kind: row.kind === 'notice' ? 'notice' : 'post',
    title: row.title,
    summary: row.summary,
    coverImageUrl: row.cover_image_url,
    // A body that fails validation is shown as empty rather than thrown on:
    // the composer can still open the row and repair it.
    blocks: parsed.ok ? parsed.blocks : [],
    status: row.status === 'published' ? 'published' : 'draft',
    publishedAt: row.published_at,
    showPopup: row.show_popup,
    audienceTenantIds: row.audience_tenant_ids,
    pushTitle: row.push_title,
    pushBody: row.push_body,
    pushSentAt: row.push_sent_at,
    pushRecipientCount: row.push_recipient_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toInsert(input: AnnouncementInput) {
  return {
    kind: input.kind,
    title: input.title,
    summary: input.summary,
    cover_image_url: input.coverImageUrl,
    blocks: input.blocks,
    show_popup: input.showPopup,
    audience_tenant_ids: input.audienceTenantIds,
    push_title: input.pushTitle,
    push_body: input.pushBody,
  }
}

/** Every announcement, newest first, with how many accounts opened each. */
export async function listAnnouncements(client: Client): Promise<AnnouncementSummary[]> {
  const { data, error } = await client
    .from('platform_announcements')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Failed to load announcements: ${error.message}`)

  const rows = (data ?? []) as AnnouncementRow[]
  if (rows.length === 0) return []

  const { data: reads, error: readsError } = await client
    .from('platform_announcement_reads')
    .select('announcement_id')
    .in(
      'announcement_id',
      rows.map((row) => row.id)
    )
  if (readsError) throw new Error(`Failed to load read counts: ${readsError.message}`)

  const counts = new Map<string, number>()
  for (const read of reads ?? []) {
    counts.set(read.announcement_id, (counts.get(read.announcement_id) ?? 0) + 1)
  }

  return rows.map((row) => ({ ...toRecord(row), readCount: counts.get(row.id) ?? 0 }))
}

export async function getAnnouncement(
  client: Client,
  id: string
): Promise<AnnouncementRecord | null> {
  const { data, error } = await client
    .from('platform_announcements')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`Failed to load announcement: ${error.message}`)
  return data ? toRecord(data as AnnouncementRow) : null
}

export async function createAnnouncement(
  client: Client,
  input: AnnouncementInput,
  createdBy: string | null
): Promise<AnnouncementRecord> {
  const { data, error } = await client
    .from('platform_announcements')
    .insert({ ...toInsert(input), created_by: createdBy })
    .select(COLUMNS)
    .single()
  if (error) throw new Error(`Failed to create announcement: ${error.message}`)
  return toRecord(data as AnnouncementRow)
}

export async function updateAnnouncement(
  client: Client,
  id: string,
  input: AnnouncementInput
): Promise<AnnouncementRecord> {
  const { data, error } = await client
    .from('platform_announcements')
    .update(toInsert(input))
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw new Error(`Failed to update announcement: ${error.message}`)
  return toRecord(data as AnnouncementRow)
}

/**
 * Publishing stamps `published_at` only the first time, so re-publishing an
 * edited post keeps its place in the merchants' list instead of jumping to
 * the top and greeting everyone again.
 */
export async function setAnnouncementStatus(
  client: Client,
  id: string,
  status: AnnouncementStatus
): Promise<AnnouncementRecord> {
  const current = await getAnnouncement(client, id)
  if (!current) throw new Error('Announcement not found')

  const publishedAt =
    status === 'published' ? (current.publishedAt ?? new Date().toISOString()) : current.publishedAt

  const { data, error } = await client
    .from('platform_announcements')
    .update({ status, published_at: publishedAt })
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw new Error(`Failed to change announcement status: ${error.message}`)
  return toRecord(data as AnnouncementRow)
}

export async function deleteAnnouncement(client: Client, id: string): Promise<void> {
  const { error } = await client.from('platform_announcements').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete announcement: ${error.message}`)
}

export interface AudienceTenant {
  id: string
  name: string
  slug: string
}

/** The stores the audience picker offers. */
export async function listAudienceTenants(client: Client): Promise<AudienceTenant[]> {
  const { data, error } = await client
    .from('tenants')
    .select('id, name, slug')
    .order('name', { ascending: true })
  if (error) throw new Error(`Failed to load stores: ${error.message}`)
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, slug: row.slug }))
}
