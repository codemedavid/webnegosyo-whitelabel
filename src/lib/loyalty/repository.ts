/**
 * Program management I/O. Runs under the service-role client: programs and
 * versions are admin-writable by RLS, but the balance correction goes through
 * `apply_loyalty_earning`, which only service_role may call — so the whole
 * surface sits behind the route's own permission check rather than half in
 * RLS and half here.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BalanceCorrectionInput, LoyaltyProgramInput } from './manage'
import { nextProgramVersion } from './versioning'
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
  let query = client.from(table).select('program_id').eq('tenant_id', tenantId)
  for (const [column, value] of Object.entries(extra)) query = query.eq(column, value)
  const { data } = await query
  const counts = new Map<string, number>()
  for (const row of (data ?? []) as Array<{ program_id: string }>) {
    counts.set(row.program_id, (counts.get(row.program_id) ?? 0) + 1)
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
  const { data: versionRows } = versionIds.length
    ? await client.from('loyalty_program_versions').select('id, version, rules').in('id', versionIds)
    : { data: [] }
  const versions = new Map(
    ((versionRows ?? []) as Array<{ id: string; version: number; rules: unknown }>).map((v) => [v.id, v]),
  )

  const [members, rewards] = await Promise.all([
    countBy(client, 'loyalty_balances', tenantId),
    countBy(client, 'loyalty_entitlements', tenantId, { status: 'issued' }),
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

/** Writes the version row and points the program at it. */
async function writeVersion(
  client: SupabaseClient,
  tenantId: string,
  programId: string,
  rules: LoyaltyRules,
  actor: string | null,
): Promise<{ id: string; version: number }> {
  const { data: latest } = await client
    .from('loyalty_program_versions')
    .select('version')
    .eq('program_id', programId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  const version = nextProgramVersion((latest as { version: number } | null)?.version ?? null)
  const { data, error } = await client
    .from('loyalty_program_versions')
    .insert({ tenant_id: tenantId, program_id: programId, version, rules, created_by: actor })
    .select('id, version')
    .single()
  if (error || !data) throw new Error(`loyalty version could not be written: ${error?.message}`)

  const { error: pointError } = await client
    .from('loyalty_programs')
    .update({ current_version_id: data.id })
    .eq('id', programId)
    .eq('tenant_id', tenantId)
  if (pointError) throw new Error(`loyalty program could not adopt its version: ${pointError.message}`)

  return data as { id: string; version: number }
}

export async function createLoyaltyProgram(
  client: SupabaseClient,
  tenantId: string,
  input: LoyaltyProgramInput,
  actor: string | null,
): Promise<{ programId: string; versionId: string }> {
  const { data, error } = await client
    .from('loyalty_programs')
    .insert({
      tenant_id: tenantId,
      name: input.name,
      description: input.description,
      earn_mode: input.earnMode,
      scope: input.scope,
      outlet_id: input.outletId,
      status: 'draft',
      created_by: actor,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`loyalty program could not be created: ${error?.message}`)

  const version = await writeVersion(client, tenantId, data.id, input.rules, actor)
  return { programId: data.id, versionId: version.id }
}

/** A rule change is a new version; the program row itself keeps its identity. */
export async function reviseLoyaltyProgram(
  client: SupabaseClient,
  tenantId: string,
  programId: string,
  rules: LoyaltyRules,
  actor: string | null,
): Promise<{ versionId: string; version: number }> {
  const { data: program } = await client
    .from('loyalty_programs')
    .select('id, earn_mode, status')
    .eq('id', programId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!program) throw new Error('Program not found.')
  const row = program as { earn_mode: string; status: LoyaltyProgramStatus }
  if (row.status === 'ended') throw new Error('An ended program cannot be changed.')
  if (row.earn_mode !== rules.earnMode) {
    // Stamps and points are not convertible; every balance would become
    // meaningless. A merchant who wants the other mode starts a new program.
    throw new Error('A program cannot change between stamps and points.')
  }

  const version = await writeVersion(client, tenantId, programId, rules, actor)
  return { versionId: version.id, version: version.version }
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
  client: SupabaseClient,
  tenantId: string,
  programId: string,
  patch: { status: LoyaltyProgramStatus; activates_at?: string; ends_at?: string },
): Promise<void> {
  const { error } = await client
    .from('loyalty_programs')
    .update(patch)
    .eq('id', programId)
    .eq('tenant_id', tenantId)
  if (error) throw new Error(`loyalty program status could not be written: ${error.message}`)
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
