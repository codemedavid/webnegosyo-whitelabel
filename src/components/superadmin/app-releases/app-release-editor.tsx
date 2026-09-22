'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, Check, Loader2 } from 'lucide-react'
import { Panel, SectionHeader } from '@/components/superadmin/ui/primitives'
import { saveAppReleaseAction } from '@/app/actions/app-releases'
import {
  APP_RELEASE_PLATFORMS,
  compareReleaseVersions,
  MAX_RELEASE_NOTES_LENGTH,
  type AppReleasePlatform,
} from '@/lib/app-releases/input'
import type { AppReleaseRecord } from '@/lib/app-releases/service'
import { cn } from '@/lib/utils'

const FIELD =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none'
const LABEL = 'mb-1 block text-xs font-medium text-white/60'

const PLATFORM_LABEL: Record<AppReleasePlatform, string> = {
  ios: 'iOS — App Store',
  android: 'Android — Play Store',
}

const STORE_PLACEHOLDER: Record<AppReleasePlatform, string> = {
  ios: 'https://apps.apple.com/app/id6761642956',
  android: 'https://play.google.com/store/apps/details?id=com.webnegosyo.admin',
}

interface Draft {
  latestVersion: string
  minimumVersion: string
  storeUrl: string
  releaseNotes: string
}

function toDraft(record: AppReleaseRecord | undefined): Draft {
  return {
    latestVersion: record?.latestVersion ?? '',
    minimumVersion: record?.minimumVersion ?? '',
    storeUrl: record?.storeUrl ?? '',
    releaseNotes: record?.releaseNotes ?? '',
  }
}

const VERSION_PATTERN = /^\d+(\.\d+){0,2}$/

/**
 * Why this draft cannot be saved yet, or null.
 *
 * The floor check is duplicated from the server on purpose: a minimum above
 * the latest release locks every merchant out of the app, so it should be
 * impossible to even click Save into it, not merely rejected afterwards.
 */
function draftError(draft: Draft): string | null {
  if (!VERSION_PATTERN.test(draft.latestVersion)) return 'Latest version should look like 1.0.9'
  if (!VERSION_PATTERN.test(draft.minimumVersion)) return 'Minimum version should look like 1.0.9'
  if (!draft.storeUrl.trim().startsWith('https://')) return 'The store link must start with https://'
  if (compareReleaseVersions(draft.minimumVersion, draft.latestVersion) > 0) {
    return 'The minimum cannot be newer than the latest release — no merchant could clear it'
  }
  return null
}

export function AppReleaseEditor({ initialReleases }: { initialReleases: AppReleaseRecord[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {APP_RELEASE_PLATFORMS.map((platform) => (
        <PlatformCard
          key={platform}
          platform={platform}
          record={initialReleases.find((r) => r.platform === platform)}
        />
      ))}
    </div>
  )
}

function PlatformCard({
  platform,
  record,
}: {
  platform: AppReleasePlatform
  record: AppReleaseRecord | undefined
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(record))
  const [saved, setSaved] = useState<string | null>(record?.updatedAt ?? null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const patch = (next: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...next }))
    setError(null)
  }

  const validation = draftError(draft)
  const isForcing =
    validation === null && compareReleaseVersions(draft.minimumVersion, draft.latestVersion) === 0

  const save = () => {
    if (validation) {
      setError(validation)
      return
    }
    startTransition(async () => {
      try {
        const result = await saveAppReleaseAction({
          platform,
          latestVersion: draft.latestVersion.trim(),
          minimumVersion: draft.minimumVersion.trim(),
          storeUrl: draft.storeUrl.trim(),
          releaseNotes: draft.releaseNotes.trim() === '' ? null : draft.releaseNotes.trim(),
        })
        setSaved(result.updatedAt)
        setError(null)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not save the release')
      }
    })
  }

  return (
    <Panel>
      <SectionHeader
        title={PLATFORM_LABEL[platform]}
        subtitle={saved ? `Last updated ${new Date(saved).toLocaleString()}` : 'Never set'}
      />

      <div className="mt-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor={`${platform}-latest`}>
              Latest version
            </label>
            <input
              id={`${platform}-latest`}
              value={draft.latestVersion}
              onChange={(e) => patch({ latestVersion: e.target.value })}
              className={FIELD}
              placeholder="1.0.9"
              inputMode="decimal"
            />
            <p className="mt-1.5 text-xs text-white/40">Older builds get a dismissible nudge.</p>
          </div>

          <div>
            <label className={LABEL} htmlFor={`${platform}-minimum`}>
              Minimum supported
            </label>
            <input
              id={`${platform}-minimum`}
              value={draft.minimumVersion}
              onChange={(e) => patch({ minimumVersion: e.target.value })}
              className={cn(FIELD, isForcing && 'border-amber-400/40')}
              placeholder="1.0.0"
              inputMode="decimal"
            />
            <p className="mt-1.5 text-xs text-white/40">Below this, the app refuses to open.</p>
          </div>
        </div>

        <div>
          <label className={LABEL} htmlFor={`${platform}-store`}>
            Store link
          </label>
          <input
            id={`${platform}-store`}
            value={draft.storeUrl}
            onChange={(e) => patch({ storeUrl: e.target.value })}
            className={FIELD}
            placeholder={STORE_PLACEHOLDER[platform]}
          />
        </div>

        <div>
          <label className={LABEL} htmlFor={`${platform}-notes`}>
            What&apos;s in this release
          </label>
          <textarea
            id={`${platform}-notes`}
            value={draft.releaseNotes}
            onChange={(e) => patch({ releaseNotes: e.target.value })}
            maxLength={MAX_RELEASE_NOTES_LENGTH}
            rows={3}
            className={cn(FIELD, 'resize-y')}
            placeholder="Shown under the update prompt. Optional."
          />
        </div>

        {isForcing ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3 text-xs text-amber-200/90">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Every merchant below {draft.latestVersion} will be locked out until they update from the store. Make sure the build
              is actually live there first.
            </span>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-red-400/25 bg-red-400/[0.06] p-3 text-xs text-red-200/90">{error}</p>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={isPending || validation !== null}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-40"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save {PLATFORM_LABEL[platform].split(' ')[0]}
          </button>
          {validation && !error ? <span className="text-xs text-white/40">{validation}</span> : null}
        </div>
      </div>
    </Panel>
  )
}
