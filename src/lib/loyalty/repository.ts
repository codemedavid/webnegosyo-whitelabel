/**
 * Program management I/O. Runs under the service-role client: programs and
 * versions are admin-writable by RLS, but the balance correction goes through
 * `apply_loyalty_earning`, which only service_role may call — so the whole
 * surface sits behind the route's own permission check rather than half in
 * RLS and half here.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BalanceCorrectionInput, LoyaltyProgramInput } from './manage'
import type { LoyaltyProgramStatus, LoyaltyRules } from './types'
import { parseLoyaltyRules } from './rules'

const PROGRAM_SELECT =
  'id, name, description, earn_mode, scope, outlet_id, status, activates_at, ends_at, current_version_id, created_at, updated_at'

export interface LoyaltyProgramSummary {
  id: string
  name: string
  description: string | null
  earnMode: 'stamp' | 'points'
  scope: 'business' | 'branch'
  outletId: string | null
  status: LoyaltyProgramStatus
  activatesAt: string | null
  endsAt: string | null
  versionNumber: number | null
  rules: LoyaltyRules | null
  members: number
  rewardsOutstanding: number
  createdAt: string
}

interface ProgramRow {
  id: string
  name: string
  description: string | null
  earn_mode: 'stamp' | 'points'
  scope: 'business' | 'branch'
  outlet_id: string | null
  status: LoyaltyProgramStatus
  activates_at: string | null
  ends_at: string | null
  current_version_id: string | null
  created_at: string
  updated_at: string
}

async function countBy(
  client: SupabaseClient,
  table: string,
  tenantId: string,
  extra: Record<string, string> = {},
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (let offset = 0; ; offset += 1000) {
    let query = client.from(table).select('program_id').eq('tenant_id', tenantId)
    for (const [column, value] of Object.entries(extra)) query = query.eq(column, value)
    if (table === 'loyalty_entitlements') query = query.in('status', ['issued', 'restored']).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    const { data, error } = await query.order('id').range(offset, offset + 999)
    if (error) throw new Error('Program totals could not be loaded. Please retry.')
    for (const row of (data ?? []) as Array<{ program_id: string }>) {
      counts.set(row.program_id, (counts.get(row.program_id) ?? 0) + 1)
    }
    if (!data || data.length < 1000) break
  }
  return counts
}

export async function listLoyaltyPrograms(
  client: SupabaseClient,
  tenantId: string,
): Promise<LoyaltyProgramSummary[]> {
  const { data, error } = await client
    .from('loyalty_programs')
    .select(PROGRAM_SELECT)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`loyalty programs could not be read: ${error.message}`)
  const programs = (data ?? []) as unknown as ProgramRow[]
  if (programs.length === 0) return []

  const versionIds = programs.map((p) => p.current_version_id).filter((id): id is string => !!id)
  const { data: versionRows, error: versionError } = versionIds.length
    ? await client.from('loyalty_program_versions').select('id, version, rules').in('id', versionIds)
    : { data: [], error: null }
  if (versionError) throw new Error('Reward rules could not be loaded. Please retry.')
  const versions = new Map(
    ((versionRows ?? []) as Array<{ id: string; version: number; rules: unknown }>).map((v) => [v.id, v]),
  )

  const [members, rewards] = await Promise.all([
    countBy(client, 'loyalty_balances', tenantId),
    countBy(client, 'loyalty_entitlements', tenantId),
  ])

  return programs.map((row) => {
    const version = row.current_version_id ? versions.get(row.current_version_id) : undefined
    const rules = version ? parseLoyaltyRules(version.rules) : null
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      earnMode: row.earn_mode,
      scope: row.scope,
      outletId: row.outlet_id,
      status: row.status,
      activatesAt: row.activates_at,
      endsAt: row.ends_at,
      versionNumber: version?.version ?? null,
      rules: rules?.ok ? rules.value : null,
      members: members.get(row.id) ?? 0,
      rewardsOutstanding: rewards.get(row.id) ?? 0,
      createdAt: row.created_at,
    }
  })
}

/** The database commits the program and current version together. */
export async function createLoyaltyProgram(
  client: SupabaseClient, tenantId: string, input: LoyaltyProgramInput, actor: string | null,
): Promise<{ programId: string; versionId: string }> {
  const { data, error } = await client.rpc('manage_loyalty_program', {
    p_tenant_id: tenantId, p_actor: actor, p_action: 'create', p_program_id: null,
    p_input: input, p_expected_version: null,
  })
  if (error || !data) throw new Error(error?.message ?? 'Program could not be created.')
  return data
}

export async function reviseLoyaltyProgram(
  client: SupabaseClient, tenantId: string, programId: string, rules: LoyaltyRules,
  actor: string | null, expectedVersion: number | null,
): Promise<{ versionId: string; version: number }> {
  const { data, error } = await client.rpc('manage_loyalty_program', {
    p_tenant_id: tenantId, p_actor: actor, p_action: 'revise', p_program_id: programId,
    p_input: { rules }, p_expected_version: expectedVersion,
  })
  if (error || !data) throw new Error(error?.message ?? 'Rules could not be saved.')
  return data
}

export async function readLoyaltyProgramStatus(
  client: SupabaseClient,
  tenantId: string,
  programId: string,
): Promise<{ status: LoyaltyProgramStatus; activatesAt: string | null } | null> {
  const { data } = await client
    .from('loyalty_programs')
    .select('status, activates_at')
    .eq('id', programId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  const row = data as { status: LoyaltyProgramStatus; activates_at: string | null } | null
  return row ? { status: row.status, activatesAt: row.activates_at } : null
}

export async function writeLoyaltyProgramStatus(
  client: SupabaseClient, tenantId: string, programId: string,
  patch: { status: LoyaltyProgramStatus; activates_at?: string; ends_at?: string },
  actor: string, expectedStatus: LoyaltyProgramStatus,
): Promise<void> {
  const { error } = await client.rpc('manage_loyalty_program', {
    p_tenant_id: tenantId, p_actor: actor, p_action: 'set_status', p_program_id: programId,
    p_input: { status: patch.status, expectedStatus }, p_expected_version: null,
  })
  if (error) throw new Error(error.message)
}

/** An audited balance correction: a ledger row with a note, applied atomically. */
export async function correctLoyaltyBalance(
  client: SupabaseClient,
  tenantId: string,
  input: BalanceCorrectionInput,
  actor: string | null,
): Promise<{ balance: number | null }> {
  const { data, error } = await client.rpc('apply_loyalty_earning', {
    p_tenant_id: tenantId,
    p_program_id: input.programId,
    p_version_id: null,
    p_customer_key: input.customerKey,
    p_customer_id: null,
    p_kind: 'correction',
    p_delta: input.delta,
    p_order_backend: null,
    p_external_order_id: null,
    p_threshold: null,
    p_reward_terms: null,
    p_reward_expires_at: null,
    p_shadow: false,
    p_actor: actor,
    p_note: input.note,
  })
  if (error) throw new Error(`balance correction failed: ${error.message}`)
  const balance = (data as { balance?: number } | null)?.balance
  return { balance: typeof balance === 'number' ? balance : null }
}
