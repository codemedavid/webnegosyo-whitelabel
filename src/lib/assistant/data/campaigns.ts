/**
 * SMS campaigns for the assistant: each campaign with its last 30 days of
 * texts (sent / failed), plus how many guests can be texted at all. Service
 * role, read after the route authorised the caller for this tenant.
 */

import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

const CAMPAIGN_LIMIT = 20
const RUN_LIMIT = 500
const SEND_LIMIT = 5000
const WINDOW_DAYS = 30
const DAY_MS = 86_400_000

export interface AssistantCampaign {
  id: string
  name: string
  status: 'draft' | 'active' | 'paused' | 'archived'
  audience: Record<string, unknown>
  scheduleKind: string
  scheduleDate: string | null
  scheduleTime: string | null
  sent30d: number
  failed30d: number
}

export interface AssistantCampaigns {
  campaigns: AssistantCampaign[]
  /** Guests who opted in and have not opted out; null when unreadable. */
  reachable: number | null
  /** True when the send history hit its read cap, so counts are a floor. */
  isSendCountCapped: boolean
}

interface CampaignRow {
  id: string
  name: string
  status: AssistantCampaign['status']
  audience: Record<string, unknown> | null
  schedule_kind: string
  schedule_date: string | null
  schedule_time: string | null
}

async function readSendCounts(client: SupabaseClient, tenantId: string, campaignIds: string[], since: string) {
  const counts = new Map<string, { sent: number; failed: number }>()
  if (campaignIds.length === 0) return { counts, isCapped: false }
  const runs = await client.from('sms_campaign_runs').select('id, campaign_id').eq('tenant_id', tenantId).in('campaign_id', campaignIds).gte('due_at', since).limit(RUN_LIMIT)
  if (runs.error) throw new Error(`campaign runs unreadable: ${runs.error.message}`)
  const campaignOfRun = new Map(((runs.data ?? []) as Array<{ id: string; campaign_id: string }>).map((run) => [run.id, run.campaign_id]))
  if (campaignOfRun.size === 0) return { counts, isCapped: false }

  const sends = await client.from('sms_sends').select('run_id, result').eq('tenant_id', tenantId).in('run_id', [...campaignOfRun.keys()]).limit(SEND_LIMIT)
  if (sends.error) throw new Error(`campaign sends unreadable: ${sends.error.message}`)
  for (const send of (sends.data ?? []) as Array<{ run_id: string; result: string }>) {
    const campaignId = campaignOfRun.get(send.run_id)
    if (!campaignId) continue
    const current = counts.get(campaignId) ?? { sent: 0, failed: 0 }
    counts.set(campaignId, {
      sent: current.sent + Number(send.result === 'sent'),
      failed: current.failed + Number(send.result === 'failed'),
    })
  }
  return { counts, isCapped: (sends.data ?? []).length >= SEND_LIMIT || (runs.data ?? []).length >= RUN_LIMIT }
}

async function readReachable(client: SupabaseClient, tenantId: string): Promise<number | null> {
  const { count, error } = await client
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('sms_consent', true)
    .not('sms_opt_out', 'is', true)
  return error ? null : (count ?? 0)
}

export async function readAssistantCampaigns(tenantId: string, now = Date.now()): Promise<AssistantCampaigns> {
  const client = createAdminClient() as unknown as SupabaseClient
  const [rows, reachable] = await Promise.all([
    client
      .from('sms_campaigns')
      .select('id, name, status, audience, schedule_kind, schedule_date, schedule_time')
      .eq('tenant_id', tenantId)
      .neq('status', 'archived')
      .order('created_at', { ascending: false })
      .limit(CAMPAIGN_LIMIT),
    readReachable(client, tenantId),
  ])
  if (rows.error) throw new Error(`campaigns unreadable: ${rows.error.message}`)
  const campaigns = (rows.data ?? []) as CampaignRow[]
  const since = new Date(now - WINDOW_DAYS * DAY_MS).toISOString()
  const { counts, isCapped } = await readSendCounts(client, tenantId, campaigns.map((c) => c.id), since)

  return {
    reachable,
    isSendCountCapped: isCapped,
    campaigns: campaigns.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      audience: row.audience ?? {},
      scheduleKind: row.schedule_kind,
      scheduleDate: row.schedule_date,
      scheduleTime: row.schedule_time,
      sent30d: counts.get(row.id)?.sent ?? 0,
      failed30d: counts.get(row.id)?.failed ?? 0,
    })),
  }
}
