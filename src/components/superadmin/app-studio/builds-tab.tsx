'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { AlertTriangle, ExternalLink, Hammer, Loader2, RefreshCw } from 'lucide-react'
import { getAppBuildsAction, startAppBuildsAction } from '@/app/actions/app-builds'
import { Panel, SectionHeader } from '@/components/superadmin/ui/primitives'
import type { AppBuildView, AppBuildsOverview } from '@/lib/app-builds/service'
import { PLATFORM_LABEL, type BuildPlatform, type BuildStatus, type SubmitStatus } from '@/lib/app-builds/status'
import { cn } from '@/lib/utils'
import { BUTTON, BUTTON_QUIET } from './studio-ui'

/** While a build is open the list re-reads itself; EAS builds take 10-40 minutes. */
const REFRESH_MS = 15_000

const STATUS_TEXT: Record<BuildStatus, string> = {
  queued: 'Waiting for the build workflow',
  preparing: 'Preparing icons and settings',
  building: 'Building on EAS',
  finished: 'Built',
  errored: 'Failed',
  cancelled: 'Cancelled',
}

const STATUS_TONE: Record<BuildStatus, string> = {
  queued: 'bg-white/[0.08] text-white/70',
  preparing: 'bg-sky-400/15 text-sky-300',
  building: 'bg-sky-400/15 text-sky-300',
  finished: 'bg-emerald-400/15 text-emerald-300',
  errored: 'bg-red-400/15 text-red-300',
  cancelled: 'bg-white/[0.08] text-white/50',
}

const SUBMIT_TEXT: Record<BuildPlatform, Record<Exclude<SubmitStatus, 'none'>, string>> = {
  ios: { submitting: 'Sending to TestFlight', submitted: 'In TestFlight', submit_failed: 'TestFlight upload failed' },
  android: { submitting: 'Sending to Play internal testing', submitted: 'On Play internal testing', submit_failed: 'Play upload failed' },
}

const isOpen = (build: AppBuildView) => build.status === 'queued' || build.status === 'preparing' || build.status === 'building'

export function BuildsTab({ tenantId, canEdit }: { tenantId: string; canEdit: boolean }) {
  const [overview, setOverview] = useState<AppBuildsOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isStarting, startTransition] = useTransition()

  /** Re-reads the list. Returns the read's error so a caller can decide what to show. */
  const read = useCallback(async (): Promise<string | null> => {
    const result = await getAppBuildsAction(tenantId)
    if (!result.ok) return result.error
    setOverview(result.data)
    return null
  }, [tenantId])

  const load = useCallback(async () => setError(await read()), [read])

  useEffect(() => {
    void load()
  }, [load])

  const hasOpen = overview?.builds.some(isOpen) ?? false
  useEffect(() => {
    if (!hasOpen) return
    const timer = setInterval(() => void load(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [hasOpen, load])

  const start = (platforms: BuildPlatform[]) =>
    startTransition(async () => {
      setError(null)
      const result = await startAppBuildsAction(tenantId, platforms)
      // A refused start keeps its reason on screen; the re-read must not wipe it.
      const readError = await read()
      setError(result.ok ? readError : result.error)
    })

  if (!overview) {
    return (
      <Panel>
        <SectionHeader title="Builds" subtitle="Store builds of this app, started from here." />
        {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : <Loader2 className="mt-4 h-5 w-5 animate-spin text-white/40" aria-label="Loading builds" />}
      </Panel>
    )
  }

  const openPlatforms = new Set(overview.builds.filter(isOpen).map((build) => build.platform))
  const isBlocked = overview.missingEnv.length > 0 || overview.problems.length > 0

  return (
    <div className="space-y-4">
      <Panel>
        <SectionHeader
          title="Build the app"
          subtitle="Makes a signed build with this app’s name, icon and splash, and sends it to testers: iOS to TestFlight, Android to Play internal testing. Nothing reaches the public stores from here."
        />
        {overview.missingEnv.length > 0 ? (
          <Notice title="The build pipeline isn’t set up on this deployment yet.">
            Missing: {overview.missingEnv.join(', ')}. See docs/runbooks/customer-app-builds.md.
          </Notice>
        ) : null}
        {overview.dryRun ? (
          <Notice title="Dry-run mode (APP_BUILD_DRY_RUN=1).">Builds check the whole pipeline up to EAS, then stop and show as failed with “Dry run”. No EAS minutes are spent.</Notice>
        ) : null}
        {overview.problems.length > 0 ? (
          <Notice title="This app can’t be built yet.">
            <ul className="list-disc pl-4">
              {overview.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
        {(['ios', 'android'] as const).map((platform) =>
          overview.submitNotes[platform] ? (
            <p key={platform} className="mt-3 text-xs text-amber-200/80">
              {PLATFORM_LABEL[platform]}: {overview.submitNotes[platform]}
            </p>
          ) : null,
        )}
        {canEdit ? (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button type="button" className={BUTTON} disabled={isBlocked || isStarting || openPlatforms.size > 0} onClick={() => start(['ios', 'android'])}>
              {isStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hammer className="h-4 w-4" />} Build iOS + Android
            </button>
            {(['ios', 'android'] as const).map((platform) => (
              <button key={platform} type="button" className={BUTTON_QUIET} disabled={isBlocked || isStarting || openPlatforms.has(platform)} onClick={() => start([platform])}>
                {PLATFORM_LABEL[platform]} only
              </button>
            ))}
            <button type="button" className={BUTTON_QUIET} onClick={() => void load()} aria-label="Refresh builds">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-300">
            {error}
          </p>
        ) : null}
      </Panel>

      <Panel>
        <SectionHeader title="Recent builds" subtitle={hasOpen ? 'Updates by itself every 15 seconds while a build runs.' : 'The last 20 builds of this app.'} />
        {overview.builds.length === 0 ? (
          <p className="mt-4 text-sm text-white/50">No builds yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-white/10">
            {overview.builds.map((build) => (
              <BuildRow key={build.id} build={build} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function BuildRow({ build }: { build: AppBuildView }) {
  const version = build.appVersion ? `${build.appVersion}${build.buildNumber ? ` (${build.buildNumber})` : ''}` : null
  return (
    <li className="flex flex-wrap items-start gap-3 py-3">
      <span className="w-16 shrink-0 text-sm font-medium text-white">{PLATFORM_LABEL[build.platform]}</span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_TONE[build.status])}>
            {isOpen(build) ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {STATUS_TEXT[build.status]}
          </span>
          {build.submitStatus !== 'none' ? (
            <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', build.submitStatus === 'submit_failed' ? 'bg-red-400/15 text-red-300' : 'bg-white/[0.08] text-white/70')}>
              {SUBMIT_TEXT[build.platform][build.submitStatus]}
            </span>
          ) : null}
          {version ? <span className="text-xs tabular-nums text-white/50">v{version}</span> : null}
        </div>
        {build.error ? <p className="text-xs text-red-300/90">{build.error}</p> : null}
        <p className="text-xs text-white/40">
          Started {new Date(build.createdAt).toLocaleString()}
          {build.finishedAt ? ` · done ${new Date(build.finishedAt).toLocaleString()}` : ''}
        </p>
      </div>
      {build.artifactUrl ? (
        <a href={build.artifactUrl} className="inline-flex items-center gap-1 text-xs text-sky-300 hover:underline" target="_blank" rel="noreferrer">
          Download <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </li>
  )
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 flex gap-3 rounded-xl bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <div className="text-amber-100/80">{children}</div>
      </div>
    </div>
  )
}
