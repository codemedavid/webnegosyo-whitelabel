/**
 * The build pipeline's wiring: which env it needs, the one-time build token,
 * the CI secret check, and the GitHub workflow dispatch.
 *
 * Why two credentials on the CI routes: GitHub shows a workflow run's inputs
 * to anyone who can see the run, and this repository is public, so the build
 * token in the dispatch inputs is NOT a secret. It only says which build; the
 * CI secret (a GitHub Actions secret, masked in logs) says the caller is our
 * workflow. Neither alone opens anything.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { MIN_WEBHOOK_SECRET_LENGTH } from './eas-webhook'

export const BUILD_WORKFLOW_FILE = 'build-customer-app.yml'

/** Env the pipeline reads, and what each one is, for the "not set up" message. */
export const PIPELINE_ENV = {
  GITHUB_DISPATCH_TOKEN: 'GitHub token that may start workflows in this repository (Actions: write)',
  APP_BUILD_GITHUB_REPO: 'the repository that holds build-customer-app.yml, as owner/name',
  APP_BUILD_CI_SECRET: 'shared secret the build workflow sends back (also a GitHub Actions secret)',
  EAS_WEBHOOK_SECRET: 'the secret the EAS build + submit webhooks are signed with',
} as const

export type PipelineEnvName = keyof typeof PIPELINE_ENV

export interface PipelineConfig {
  dispatchToken: string
  repo: string
  ref: string
  /** APP_BUILD_DRY_RUN=1: every run stops before `eas build` (proves the wiring, spends no EAS minutes). */
  dryRun: boolean
}

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const MIN_SECRET = 24

/** The names that are missing or unusable on this deployment. Empty = ready. */
export function missingPipelineEnv(env: NodeJS.ProcessEnv = process.env): PipelineEnvName[] {
  const missing: PipelineEnvName[] = []
  if (!env.GITHUB_DISPATCH_TOKEN?.trim()) missing.push('GITHUB_DISPATCH_TOKEN')
  if (!REPO.test(env.APP_BUILD_GITHUB_REPO?.trim() ?? '')) missing.push('APP_BUILD_GITHUB_REPO')
  if ((env.APP_BUILD_CI_SECRET?.trim().length ?? 0) < MIN_SECRET) missing.push('APP_BUILD_CI_SECRET')
  if ((env.EAS_WEBHOOK_SECRET?.trim().length ?? 0) < MIN_WEBHOOK_SECRET_LENGTH) missing.push('EAS_WEBHOOK_SECRET')
  return missing
}

export function readPipelineConfig(env: NodeJS.ProcessEnv = process.env): PipelineConfig | null {
  if (missingPipelineEnv(env).length > 0) return null
  return {
    dispatchToken: (env.GITHUB_DISPATCH_TOKEN as string).trim(),
    repo: (env.APP_BUILD_GITHUB_REPO as string).trim(),
    ref: env.APP_BUILD_GITHUB_REF?.trim() || 'main',
    dryRun: env.APP_BUILD_DRY_RUN?.trim() === '1',
  }
}

/** A fresh build token (shown to the workflow once) and the hash the database keeps. */
export function newBuildToken(): { token: string; hash: string } {
  const token = `wnbt_${randomBytes(32).toString('base64url')}`
  return { token, hash: hashBuildToken(token) }
}

export function hashBuildToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

const TOKEN = /^wnbt_[A-Za-z0-9_-]{43}$/

/** The token in `Authorization: Bearer …`, or null when it isn't one of ours. */
export function bearerBuildToken(header: string | null): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header?.trim() ?? '')
  return match && TOKEN.test(match[1]) ? match[1] : null
}

/** `x-app-build-secret` against APP_BUILD_CI_SECRET, in constant time. Fails closed when unset. */
export function isCiSecret(given: string | null, env: NodeJS.ProcessEnv = process.env): boolean {
  const secret = env.APP_BUILD_CI_SECRET?.trim() ?? ''
  if (secret.length < MIN_SECRET || !given) return false
  const a = createHash('sha256').update(given, 'utf8').digest()
  const b = createHash('sha256').update(secret, 'utf8').digest()
  return timingSafeEqual(a, b)
}

export type DispatchResult = { ok: true } | { ok: false; reason: string }

/**
 * Starts one run of the build workflow for one build. GitHub answers 204 with
 * no run id; the run reports back through the manifest route.
 */
export async function dispatchBuildWorkflow(
  config: PipelineConfig,
  buildToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DispatchResult> {
  const url = `https://api.github.com/repos/${config.repo}/actions/workflows/${BUILD_WORKFLOW_FILE}/dispatches`
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${config.dispatchToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: config.ref, inputs: { build_token: buildToken, ...(config.dryRun ? { dry_run: 'true' } : {}) } }),
      signal: AbortSignal.timeout(10_000),
    })
    if (response.status === 204 || response.ok) return { ok: true }
    return { ok: false, reason: `GitHub answered ${response.status}` }
  } catch (error) {
    return { ok: false, reason: error instanceof Error && error.name === 'TimeoutError' ? 'GitHub did not answer in time' : 'GitHub could not be reached' }
  }
}
