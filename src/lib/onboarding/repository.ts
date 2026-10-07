/**
 * `store_onboardings` I/O. The table is service-role only (RLS on, no
 * policies), so every function takes the admin client; authorization is the
 * caller's job — a valid token for the buyer, a platform permission for staff,
 * an owner session for the store admin.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { OnboardingAnswers } from './answers'
import type { OnboardingBuildStepId, OnboardingSteps, StepState } from './plan'
import type { LaunchBuildSummary } from './summary'
import { staleBuildCutoff } from './build-staleness'

export type OnboardingStatus = 'awaiting_details' | 'queued' | 'running' | 'ready' | 'failed'

export interface OnboardingAssets {
  logoUrl?: string | null
  menuImageUrls?: string[]
}

export interface StoreOnboarding {
  id: string
  checkoutLeadId: string
  tenantId: string | null
  status: OnboardingStatus
  answers: OnboardingAnswers | null
  assets: OnboardingAssets
  steps: OnboardingSteps
  summary: LaunchBuildSummary | null
  error: string | null
  attempts: number
  launchRequestedAt: string | null
  createdAt: string
  /** Bumped by trigger on every write — the build's heartbeat. */
  updatedAt: string
}

interface OnboardingRow {
  id: string
  checkout_lead_id: string
  tenant_id: string | null
  status: OnboardingStatus
  input: OnboardingAnswers | null
  assets: OnboardingAssets | null
  steps: OnboardingSteps | null
  summary: LaunchBuildSummary | null
  error: string | null
  attempts: number
  launch_requested_at: string | null
  created_at: string
  updated_at: string
}

const COLUMNS =
  'id, checkout_lead_id, tenant_id, status, input, assets, steps, summary, error, attempts, launch_requested_at, created_at, updated_at'

// The generated types do not know this table until they are regenerated, so
// the table handle is reached through an untyped view of the client.
function table(client: SupabaseClient) {
  return (client as unknown as SupabaseClient).from('store_onboardings')
}

function toOnboarding(row: OnboardingRow): StoreOnboarding {
  return {
    id: row.id,
    checkoutLeadId: row.checkout_lead_id,
    tenantId: row.tenant_id,
    status: row.status,
    answers: row.input,
    assets: row.assets ?? {},
    steps: row.steps ?? {},
    summary: row.summary,
    error: row.error,
    attempts: row.attempts,
    launchRequestedAt: row.launch_requested_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function selectOne(
  client: SupabaseClient,
  column: 'token_hash' | 'id' | 'checkout_lead_id' | 'tenant_id',
  value: string,
): Promise<StoreOnboarding | null> {
  const { data, error } = await table(client).select(COLUMNS).eq(column, value).maybeSingle()
  if (error) throw new Error(`Store set-up could not be read: ${error.message}`)
  return data ? toOnboarding(data as OnboardingRow) : null
}

export const findOnboardingByTokenHash = (client: SupabaseClient, hash: string) => selectOne(client, 'token_hash', hash)
export const findOnboardingById = (client: SupabaseClient, id: string) => selectOne(client, 'id', id)
export const findOnboardingByLead = (client: SupabaseClient, leadId: string) => selectOne(client, 'checkout_lead_id', leadId)
export const findOnboardingByTenant = (client: SupabaseClient, tenantId: string) => selectOne(client, 'tenant_id', tenantId)

export async function createOnboarding(client: SupabaseClient, leadId: string, tokenHash: string): Promise<string> {
  const { data, error } = await table(client)
    .insert({ checkout_lead_id: leadId, token_hash: tokenHash })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Store set-up could not be started: ${error?.message ?? 'no row'}`)
  return (data as { id: string }).id
}

/** A fresh link for a buyer who lost theirs; the old one stops working. */
export async function rotateOnboardingToken(client: SupabaseClient, id: string, tokenHash: string): Promise<void> {
  const { data, error } = await table(client).update({ token_hash: tokenHash }).eq('id', id).select('id')
  if (error || !data?.length) throw new Error(`Set-up link could not be renewed: ${error?.message ?? 'not found'}`)
}

/** Lost compare-and-swap rounds before giving up; each round is one re-read. */
const MAX_ASSET_WRITE_ATTEMPTS = 5

async function readAssetsForWrite(client: SupabaseClient, id: string) {
  const { data, error } = await table(client).select('assets, status, updated_at').eq('id', id).maybeSingle()
  if (error) throw new Error(`Upload could not be saved: ${error.message}`)
  if (!data) throw new Error('This set-up no longer exists.')
  return data as { assets: OnboardingAssets | null; status: OnboardingStatus; updated_at: string }
}

/**
 * Read-modify-write of `assets` that cannot lose a parallel upload: the write
 * only lands if `updated_at` is still what was read (compare-and-swap); if
 * another upload got in between, re-read and apply `change` to the new value.
 * `change` returning null refuses the write (e.g. photo limit) and returns null.
 */
export async function updateOnboardingAssets(
  client: SupabaseClient,
  id: string,
  change: (assets: OnboardingAssets) => OnboardingAssets | null,
): Promise<OnboardingAssets | null> {
  for (let attempt = 0; attempt < MAX_ASSET_WRITE_ATTEMPTS; attempt += 1) {
    const current = await readAssetsForWrite(client, id)
    if (current.status !== 'awaiting_details') throw new Error('This store is already being built.')
    const assets = change(current.assets ?? {})
    if (!assets) return null

    const { data, error } = await table(client)
      .update({ assets })
      .eq('id', id)
      .eq('status', 'awaiting_details')
      .eq('updated_at', current.updated_at)
      .select('id')
    if (error) throw new Error(`Upload could not be saved: ${error.message}`)
    if (data?.length) return assets
  }
  throw new Error('Upload could not be saved: too many changes at once.')
}

/**
 * Claim the submit: awaiting_details → queued with the answers, exactly once.
 * False when another request got there first. Claimed BEFORE the store is
 * created, so two taps on "Build my store" can never make two stores.
 */
export async function claimOnboardingSubmit(
  client: SupabaseClient,
  id: string,
  answers: OnboardingAnswers,
): Promise<boolean> {
  const { data, error } = await table(client)
    .update({ status: 'queued', input: answers, error: null })
    .eq('id', id)
    .eq('status', 'awaiting_details')
    .select('id')
  if (error) throw new Error(`Store set-up could not be queued: ${error.message}`)
  return (data?.length ?? 0) > 0
}

/** Undo a claim whose store could not be created, so the buyer can try again. */
export async function releaseOnboardingSubmit(client: SupabaseClient, id: string, reason: string): Promise<void> {
  const { error } = await table(client)
    .update({ status: 'awaiting_details', error: reason })
    .eq('id', id)
    .eq('status', 'queued')
    .is('tenant_id', null)
  if (error) console.error('[onboarding] submit claim could not be released', { id, error: error.message })
}

export async function attachOnboardingTenant(client: SupabaseClient, id: string, tenantId: string): Promise<void> {
  const { data, error } = await table(client).update({ tenant_id: tenantId }).eq('id', id).select('id')
  if (error || !data?.length) throw new Error(`The new store could not be linked to its set-up: ${error?.message ?? 'not found'}`)
}

/**
 * queued/failed → running, or take over a running build that died (no write
 * for STALE_BUILD_MS). One conditional UPDATE, so two callers can never both
 * claim: the winner's write bumps `updated_at`, and Postgres re-checks the
 * loser's filter against that fresh row. False when a live build holds it.
 */
export async function claimOnboardingBuild(client: SupabaseClient, id: string, attempts: number): Promise<boolean> {
  const { data, error } = await table(client)
    .update({ status: 'running', started_at: new Date().toISOString(), attempts: attempts + 1, error: null })
    .eq('id', id)
    .in('status', ['queued', 'running', 'failed'])
    .or(`status.neq.running,updated_at.lt."${staleBuildCutoff(Date.now())}"`)
    .select('id')
  if (error) throw new Error(`Store build could not start: ${error.message}`)
  return (data?.length ?? 0) > 0
}

export async function writeOnboardingSteps(client: SupabaseClient, id: string, steps: OnboardingSteps): Promise<void> {
  const { error } = await table(client).update({ steps }).eq('id', id)
  if (error) console.error('[onboarding] step progress could not be saved', { id, error: error.message })
}

export function withStep(steps: OnboardingSteps, stepId: OnboardingBuildStepId, state: Omit<StepState, 'at'>): OnboardingSteps {
  return { ...steps, [stepId]: { ...state, at: new Date().toISOString() } }
}

export async function finishOnboardingBuild(
  client: SupabaseClient,
  id: string,
  outcome: { status: 'ready'; summary: LaunchBuildSummary } | { status: 'failed'; error: string; summary: LaunchBuildSummary },
): Promise<void> {
  const patch = outcome.status === 'ready'
    ? { status: 'ready', summary: outcome.summary, error: null, finished_at: new Date().toISOString() }
    : { status: 'failed', summary: outcome.summary, error: outcome.error, finished_at: new Date().toISOString() }
  const { error } = await table(client).update(patch).eq('id', id)
  if (error) throw new Error(`Store build result could not be saved: ${error.message}`)
}

export async function markLaunchRequested(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await table(client)
    .update({ launch_requested_at: new Date().toISOString() })
    .eq('id', id)
    .is('launch_requested_at', null)
  if (error) throw new Error(`Launch request could not be saved: ${error.message}`)
}
