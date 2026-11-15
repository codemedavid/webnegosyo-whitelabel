import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { ExportError } from '../errors'
import { MAX_REPORT_TEMPLATES, templateCard, templateSpecProblem, toReportTemplate, type ReportTemplate, type TemplateCard, type TemplateShape } from '../report-templates'
import type { ExportAccess } from '../types'

const COLUMNS = 'id, name, kind, spec, created_by_label, created_at'

interface TemplateClient {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any -- report_templates is not in the generated types until they are regenerated
}

async function templateClient(): Promise<TemplateClient> {
  // The CALLER's session: RLS decides (store-wide accounts with `reports`). Never the service role.
  return (await createClient()) as unknown as TemplateClient
}

const NOT_ALLOWED = 'Saved formats are for accounts that see the whole store and hold the Reports permission.'

/**
 * The store's saved formats this caller may read, newest first. A
 * branch-locked account (or one without `reports`) reads none: RLS answers
 * with zero rows, which is the right list for them. Rows this build cannot
 * read as a format are left out.
 */
export async function listReportTemplates(tenantId: string): Promise<ReportTemplate[]> {
  const client = await templateClient()
  const { data, error } = await client
    .from('report_templates')
    .select(COLUMNS)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(MAX_REPORT_TEMPLATES)
  if (error) throw new Error(`saved formats could not be read: ${error.message}`)
  return ((data ?? []) as unknown[]).flatMap((row) => {
    const template = toReportTemplate(row)
    return template ? [template] : []
  })
}

/**
 * The saved formats as the Export page (and the app) lists them for this
 * account. A failed read hides the list, never the page: it answers with none.
 */
export async function loadTemplateCards(tenantId: string, access: ExportAccess, isMultiBranch: boolean): Promise<TemplateCard[]> {
  try {
    return (await listReportTemplates(tenantId)).map((template) => templateCard(template, access, isMultiBranch))
  } catch (error) {
    console.error('[exports] saved formats failed', error instanceof Error ? error.message : error)
    return []
  }
}

/** The caller's own name as the store typed it; a failed read just leaves the label blank. */
async function userLabel(client: TemplateClient, userId: string): Promise<string | null> {
  const { data } = await client.from('app_users').select('display_name, email').eq('user_id', userId).maybeSingle()
  const label = (data?.display_name as string | null)?.trim() || (data?.email as string | null)?.trim() || null
  return label ? label.slice(0, 120) : null
}

/**
 * One saved format by its id, as the CALLER, or null: gone, another store's,
 * or not this account's to read (RLS answers all three with no row).
 */
export async function getReportTemplate(tenantId: string, id: string): Promise<ReportTemplate | null> {
  const client = await templateClient()
  const { data, error } = await client.from('report_templates').select(COLUMNS).eq('tenant_id', tenantId).eq('id', id).maybeSingle()
  if (error) throw new Error(`saved format could not be read: ${error.message}`)
  return data ? toReportTemplate(data) : null
}

export interface SaveTemplateInput {
  tenantId: string
  userId: string
  name: string
  shape: TemplateShape
}

/**
 * Saves a format as the CALLER. Refusals the person can act on (the name is
 * taken, the store is full, the account may not) come back as an
 * `ExportError` with its own sentence; the row is asserted, never assumed.
 */
export async function saveReportTemplate(input: SaveTemplateInput): Promise<ReportTemplate> {
  const problem = templateSpecProblem(input.shape)
  if (problem) throw new ExportError(problem, 400)
  const client = await templateClient()
  const { data, error } = await client
    .from('report_templates')
    .insert({
      tenant_id: input.tenantId,
      name: input.name,
      kind: input.shape.kind,
      spec: input.shape.spec,
      created_by: input.userId,
      created_by_label: await userLabel(client, input.userId),
    })
    .select(COLUMNS)
  if (error) {
    if (error.code === '23505') throw new ExportError(`You already have a format called “${input.name}”. Remove it first, or save this one under another name.`, 409)
    if (error.code === '42501') throw new ExportError(NOT_ALLOWED, 403)
    if (typeof error.message === 'string' && error.message.includes('report_templates_limit')) {
      throw new ExportError(`A store keeps up to ${MAX_REPORT_TEMPLATES} saved formats. Remove one you no longer use, then save again.`, 409)
    }
    throw new Error(`format not saved: ${error.message}`)
  }
  const saved = Array.isArray(data) && data.length === 1 ? toReportTemplate(data[0]) : null
  if (!saved) throw new Error('format not saved: no row came back')
  return saved
}

/** Removes one format as the CALLER. RLS refuses silently (zero rows), so the removed row is asserted. */
export async function removeReportTemplate(tenantId: string, id: string): Promise<void> {
  const client = await templateClient()
  const { data, error } = await client.from('report_templates').delete().eq('tenant_id', tenantId).eq('id', id).select('id')
  if (error) throw new Error(`format not removed: ${error.message}`)
  if (!Array.isArray(data) || data.length !== 1) {
    throw new ExportError('That format is already gone, or this account may not remove it.', 404)
  }
}
