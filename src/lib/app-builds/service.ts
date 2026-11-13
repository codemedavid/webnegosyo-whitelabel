import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/supabase'
import { appStudioDb } from '@/lib/app-studio/service'
import { buildManifest, buildProblems, submitNote, type AppBuildManifest, type BuildableApp } from './manifest'
import type { EasEvent } from './eas-webhook'
import {
  BUILD_TOKEN_TTL_MS,
  OPEN_BUILD_STATUSES,
  PLATFORM_LABEL,
  TERMINAL_BUILD_STATUSES,
  isBuildStatus,
  staleReason,
  type BuildPlatform,
  type BuildStatus,
  type SubmitStatus,
} from './status'
import { dispatchBuildWorkflow, hashBuildToken, missingPipelineEnv, newBuildToken, readPipelineConfig } from './pipeline'

/**
 * Reads and writes on `tenant_app_builds` (service role only, like the rest
 * of App Studio's tables). Callers have already checked who is asking:
 * App Studio actions the `customer_apps.*` console grant, the CI routes the
 * CI secret + build token, the EAS route the webhook signature. Every write
 * names the status it expects to move from, so a stale or replayed caller
 * changes nothing instead of overwriting a newer state.
 */

type Db = SupabaseClient<Database>
type BuildRow = Database['public']['Tables']['tenant_app_builds']['Row']

export const appBuildsDb = appStudioDb

export class AppBuildError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AppBuildError'
  }
}

const BUILD_COLUMNS =
  'id, tenant_id, platform, status, eas_build_id, app_version, build_number, artifact_url, submit_status, error, manifest, created_by, created_at, updated_at, finished_at, token_expires_at'

/** A build as App Studio shows it (never the token hash). */
export interface AppBuildView {
  id: string
  platform: BuildPlatform
  status: BuildStatus
  submitStatus: SubmitStatus
  easBuildId: string | null
  appVersion: string | null
  buildNumber: string | null
  artifactUrl: string | null
  error: string | null
  sendsToTesters: boolean
  createdBy: string | null
  createdAt: string
  updatedAt: string
  finishedAt: string | null
}

export interface AppBuildsOverview {
  builds: AppBuildView[]
  /** Env names this deployment lacks; non-empty = the Build button explains instead of building. */
  missingEnv: string[]
  /** What stops this app's identity from being built. */
  problems: string[]
  /** APP_BUILD_DRY_RUN=1 on this deployment: runs stop before EAS. */
  dryRun: boolean
  /** Per platform: why its builds won't go to testers, or null. */
  submitNotes: Record<BuildPlatform, string | null>
}

type ViewRow = Omit<BuildRow, 'token_hash'>

function toView(row: ViewRow): AppBuildView {
  const manifest = row.manifest as Partial<AppBuildManifest> | null
  return {
    id: row.id,
    platform: row.platform as BuildPlatform,
    status: isBuildStatus(row.status) ? row.status : 'errored',
    submitStatus: row.submit_status as SubmitStatus,
    easBuildId: row.eas_build_id,
    appVersion: row.app_version,
    buildNumber: row.build_number,
    artifactUrl: row.artifact_url,
    error: row.error,
    sendsToTesters: manifest?.submit?.enabled === true,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
  }
}

const APP_COLUMNS = 'display_name, bundle_id, android_package, icon_url, splash_url, splash_background, asc_app_id'

async function readBuildableApp(db: Db, tenantId: string): Promise<BuildableApp | null> {
  const { data, error } = await db.from('tenant_apps').select(APP_COLUMNS).eq('tenant_id', tenantId).maybeSingle()
  if (error) throw new Error(`tenant_apps read failed: ${error.message}`)
  return data
}

export async function listBuilds(db: Db, tenantId: string, limit = 20): Promise<AppBuildView[]> {
  const { data, error } = await db
    .from('tenant_app_builds')
    .select(BUILD_COLUMNS)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`tenant_app_builds read failed: ${error.message}`)
  return (data ?? []).map((row) => toView(row as ViewRow))
}

export async function buildsOverview(db: Db, tenantId: string): Promise<AppBuildsOverview> {
  const [app, builds] = await Promise.all([readBuildableApp(db, tenantId), listBuilds(db, tenantId)])
  if (!app) throw new AppBuildError('This app no longer exists. Reload the page.')
  return {
    builds,
    missingEnv: missingPipelineEnv(),
    problems: buildProblems(app),
    dryRun: readPipelineConfig()?.dryRun ?? false,
    submitNotes: { ios: submitNote(app, 'ios'), android: submitNote(app, 'android') },
  }
}

/** Closes open builds that are stuck (see `staleReason`), so a lost CI run can't block the app. */
async function closeStaleBuilds(db: Db, tenantId: string, platforms: readonly BuildPlatform[], now: Date): Promise<void> {
  const { data, error } = await db
    .from('tenant_app_builds')
    .select('id, status, updated_at')
    .eq('tenant_id', tenantId)
    .in('platform', [...platforms])
    .in('status', [...OPEN_BUILD_STATUSES])
  if (error) throw new Error(`open builds read failed: ${error.message}`)
  for (const row of data ?? []) {
    if (!isBuildStatus(row.status)) continue
    const reason = staleReason({ status: row.status, updatedAt: row.updated_at }, now)
    if (!reason) continue
    await db
      .from('tenant_app_builds')
      .update({ status: 'errored', error: reason })
      .eq('id', row.id)
      .eq('status', row.status)
  }
}

/**
 * Starts one build per platform: snapshot the manifest, insert the row with
 * the token's hash, dispatch the workflow. A dispatch that fails closes its
 * row as errored with the reason, so the panel says so instead of waiting.
 */
export async function startBuilds(
  db: Db,
  tenantId: string,
  platforms: readonly BuildPlatform[],
  userId: string,
  now: Date = new Date(),
): Promise<AppBuildView[]> {
  const config = readPipelineConfig()
  if (!config) {
    throw new AppBuildError(`The build pipeline isn’t set up on this deployment yet (missing ${missingPipelineEnv().join(', ')}).`)
  }
  const app = await readBuildableApp(db, tenantId)
  if (!app) throw new AppBuildError('This app no longer exists. Reload the page.')
  const problems = buildProblems(app)
  if (problems.length > 0) throw new AppBuildError(problems.join(' '))

  await closeStaleBuilds(db, tenantId, platforms, now)

  const started: AppBuildView[] = []
  for (const platform of platforms) {
    const id = crypto.randomUUID()
    const { token, hash } = newBuildToken()
    const manifest = buildManifest(app, id, platform)
    const { data, error } = await db
      .from('tenant_app_builds')
      .insert({
        id,
        tenant_id: tenantId,
        platform,
        token_hash: hash,
        token_expires_at: new Date(now.getTime() + BUILD_TOKEN_TTL_MS).toISOString(),
        manifest: manifest as unknown as Json,
        created_by: userId,
      })
      .select(BUILD_COLUMNS)
      .single()
    if (error) {
      if (error.code === '23505') throw new AppBuildError(`An ${PLATFORM_LABEL[platform]} build is already running for this app.`)
      throw new Error(`tenant_app_builds insert failed: ${error.message}`)
    }

    const dispatched = await dispatchBuildWorkflow(config, token)
    if (!dispatched.ok) {
      const { data: closed } = await db
        .from('tenant_app_builds')
        .update({ status: 'errored', error: `The build workflow couldn’t be started (${dispatched.reason}).` })
        .eq('id', id)
        .eq('status', 'queued')
        .select(BUILD_COLUMNS)
        .maybeSingle()
      started.push(toView((closed ?? data) as ViewRow))
      continue
    }
    started.push(toView(data as ViewRow))
  }
  return started
}

// ── CI side ────────────────────────────────────────────────────────────────

export interface CiBuild {
  id: string
  status: BuildStatus
  manifest: AppBuildManifest
}

/** The open, unexpired build this token was issued for, or null. */
export async function findCiBuild(db: Db, token: string, now: Date = new Date()): Promise<CiBuild | null> {
  const { data, error } = await db
    .from('tenant_app_builds')
    .select('id, status, manifest, token_expires_at')
    .eq('token_hash', hashBuildToken(token))
    .maybeSingle()
  if (error) throw new Error(`build token lookup failed: ${error.message}`)
  if (!data || !isBuildStatus(data.status)) return null
  if (data.status !== 'queued' && data.status !== 'preparing') return null
  if (new Date(data.token_expires_at).getTime() <= now.getTime()) return null
  if (!data.manifest || typeof data.manifest !== 'object') return null
  return { id: data.id, status: data.status, manifest: data.manifest as unknown as AppBuildManifest }
}

/** The workflow fetched its manifest: queued → preparing (a second fetch is fine). */
export async function markPreparing(db: Db, build: CiBuild): Promise<void> {
  if (build.status === 'preparing') return
  const { error } = await db.from('tenant_app_builds').update({ status: 'preparing' }).eq('id', build.id).eq('status', 'queued')
  if (error) throw new Error(`mark preparing failed: ${error.message}`)
}

/** The workflow started the EAS build. False: the build was no longer open (nothing changed). */
export async function markBuilding(db: Db, buildId: string, easBuildId: string): Promise<boolean> {
  const { data, error } = await db
    .from('tenant_app_builds')
    .update({ status: 'building', eas_build_id: easBuildId.toLowerCase() })
    .eq('id', buildId)
    .in('status', ['queued', 'preparing'])
    .is('eas_build_id', null)
    .select('id')
  if (error) {
    if (error.code === '23505') return false
    throw new Error(`mark building failed: ${error.message}`)
  }
  return (data ?? []).length === 1
}

/** The workflow failed before EAS had the build (asset check, CLI error). */
export async function markCiFailed(db: Db, buildId: string, reason: string): Promise<boolean> {
  const { data, error } = await db
    .from('tenant_app_builds')
    .update({ status: 'errored', error: reason.slice(0, 2000) })
    .eq('id', buildId)
    .in('status', ['queued', 'preparing'])
    .select('id')
  if (error) throw new Error(`mark failed failed: ${error.message}`)
  return (data ?? []).length === 1
}

// ── EAS side ───────────────────────────────────────────────────────────────

export type EasApplyOutcome = 'applied' | 'unchanged' | 'unknown-build'

/**
 * One EAS webhook event onto its build. A build is found by its EAS id, or by
 * the `wnb:<id>` message when the workflow never got to report the EAS id.
 * Only a still-open build takes a build outcome; a submission only touches a
 * finished build's `submit_status`. Replays and late events change nothing.
 */
export async function applyEasEvent(db: Db, event: EasEvent): Promise<EasApplyOutcome> {
  if (event.kind === 'ignored') return 'unchanged'

  if (event.kind === 'submit') {
    const { data, error } = await db
      .from('tenant_app_builds')
      .update(
        event.ok
          ? { submit_status: 'submitted' }
          : { submit_status: 'submit_failed', error: `Sending to testers failed: ${event.error ?? 'no reason given'}`.slice(0, 2000) },
      )
      .eq('eas_build_id', event.easBuildId)
      // 'building' too: a submission report can overtake its build's own webhook.
      .in('status', ['building', 'finished'])
      .in('submit_status', ['none', 'submitting'])
      .select('id')
    if (error) throw new Error(`submit update failed: ${error.message}`)
    if ((data ?? []).length > 0) return 'applied'
    const { data: known } = await db.from('tenant_app_builds').select('id').eq('eas_build_id', event.easBuildId).maybeSingle()
    return known ? 'unchanged' : 'unknown-build'
  }

  const { data: found, error: findError } = await db
    .from('tenant_app_builds')
    .select('id, status, eas_build_id, submit_status, manifest')
    .or(event.buildId ? `eas_build_id.eq.${event.easBuildId},id.eq.${event.buildId}` : `eas_build_id.eq.${event.easBuildId}`)
    .limit(2)
  if (findError) throw new Error(`build lookup failed: ${findError.message}`)
  const row = (found ?? []).find((candidate) => candidate.eas_build_id === event.easBuildId)
    ?? (found ?? []).find((candidate) => candidate.id === event.buildId && candidate.eas_build_id === null)
  if (!row) return 'unknown-build'
  if ((TERMINAL_BUILD_STATUSES as readonly string[]).includes(row.status)) return 'unchanged'

  const manifest = row.manifest as Partial<AppBuildManifest> | null
  const sendsToTesters = manifest?.submit?.enabled === true
  const { data, error } = await db
    .from('tenant_app_builds')
    .update({
      status: event.status,
      ...(row.eas_build_id === null ? { eas_build_id: event.easBuildId } : {}),
      artifact_url: event.artifactUrl,
      app_version: event.appVersion,
      build_number: event.buildNumber,
      error: event.error,
      ...(event.status === 'finished' && sendsToTesters && row.submit_status === 'none' ? { submit_status: 'submitting' } : {}),
    })
    .eq('id', row.id)
    .eq('status', row.status)
    .select('id')
  if (error) {
    // 23514: the trigger refused (another event closed it in between); 23505: that EAS id is on another build.
    if (error.code === '23514' || error.code === '23505') return 'unchanged'
    throw new Error(`build update failed: ${error.message}`)
  }
  return (data ?? []).length === 1 ? 'applied' : 'unchanged'
}
