'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { saveAppListingAction, saveAppReleaseAction } from '@/app/actions/app-studio'
import { Panel, SectionHeader } from '@/components/superadmin/ui/primitives'
import { APP_STATUSES, LISTING_CATEGORIES, PLAY_TRACKS, appListingInputSchema, appReleaseInputSchema, firstIssue } from '@/lib/app-studio/inputs'
import type { AppStudioApp } from '@/lib/app-studio/service'
import { BUTTON, Counter, Field, FIELD } from './studio-ui'

interface TabProps {
  tenantId: string
  app: AppStudioApp
  onSaved: (app: AppStudioApp) => void
  canEdit: boolean
}

function useSaver() {
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isSaving, start] = useTransition()
  return { error, setError, notice, setNotice, isSaving, start }
}

function SaveRow({ label, onSave, saver, canEdit }: { label: string; onSave: () => void; saver: ReturnType<typeof useSaver>; canEdit: boolean }) {
  if (!canEdit) return null
  return (
    <div className="flex items-center gap-3">
      <button type="button" className={BUTTON} onClick={onSave} disabled={saver.isSaving}>
        {saver.isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {label}
      </button>
      {saver.error ? <p className="text-sm text-red-300">{saver.error}</p> : saver.notice ? <p className="text-sm text-emerald-300">{saver.notice}</p> : null}
    </div>
  )
}

const CATEGORY_LABEL: Record<(typeof LISTING_CATEGORIES)[number], string> = { food_and_drink: 'Food & Drink', shopping: 'Shopping', lifestyle: 'Lifestyle' }

export function ListingTab({ tenantId, app, onSaved, canEdit }: TabProps) {
  const stored = appListingInputSchema.safeParse(app.listing ?? {})
  const [form, setForm] = useState(() => {
    const value = stored.success ? stored.data : appListingInputSchema.parse({})
    return { ...value, supportUrl: value.supportUrl ?? '', privacyUrl: value.privacyUrl ?? '' }
  })
  const saver = useSaver()
  const patch = (next: Partial<typeof form>) => {
    setForm((current) => ({ ...current, ...next }))
    saver.setError(null)
    saver.setNotice(null)
  }
  const save = () => {
    const parsed = appListingInputSchema.safeParse(form)
    if (!parsed.success) return saver.setError(firstIssue(parsed.error))
    saver.start(async () => {
      const result = await saveAppListingAction(tenantId, parsed.data)
      if (!result.ok) return saver.setError(result.error)
      onSaved(result.data)
      saver.setNotice('Saved. The next store submission uses it.')
    })
  }

  const text = (key: 'subtitle' | 'promotionalText' | 'keywords', label: string, max: number, hint: string) => (
    <Field label={label} htmlFor={key} hint={hint}>
      <div className="relative">
        <input id={key} className={FIELD} value={form[key]} disabled={!canEdit} onChange={(event) => patch({ [key]: event.target.value })} />
        <span className="absolute right-3 top-2.5">
          <Counter value={form[key]} max={max} />
        </span>
      </div>
    </Field>
  )

  return (
    <Panel>
      <SectionHeader title="Store listing" subtitle="What the App Store and Google Play show about this app. Sent with the next submission." />
      <div className="mt-5 space-y-4">
        {text('subtitle', 'Subtitle', 30, 'Under the name on the App Store, e.g. “Order ahead, earn stamps”.')}
        {text('promotionalText', 'Promotional text', 170, 'Top of the description; can change without a new build.')}
        <Field label="Description" htmlFor="description" hint="What a customer gets: ordering, delivery, rewards. Plain text.">
          <textarea id="description" rows={7} className={FIELD} value={form.description} disabled={!canEdit} onChange={(event) => patch({ description: event.target.value })} />
          <div className="mt-1 text-right">
            <Counter value={form.description} max={4000} />
          </div>
        </Field>
        {text('keywords', 'Keywords', 100, 'Comma-separated, for App Store search: coffee,milk tea,delivery.')}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Support link" htmlFor="support-url">
            <input id="support-url" className={FIELD} value={form.supportUrl} disabled={!canEdit} onChange={(event) => patch({ supportUrl: event.target.value })} placeholder="https://" />
          </Field>
          <Field label="Privacy policy link" htmlFor="privacy-url" hint="Both stores require one.">
            <input id="privacy-url" className={FIELD} value={form.privacyUrl} disabled={!canEdit} onChange={(event) => patch({ privacyUrl: event.target.value })} placeholder="https://" />
          </Field>
        </div>
        <Field label="Category" htmlFor="category">
          <select id="category" className={FIELD} value={form.category} disabled={!canEdit} onChange={(event) => patch({ category: event.target.value as typeof form.category })}>
            {LISTING_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABEL[category]}
              </option>
            ))}
          </select>
        </Field>
        <SaveRow label="Save listing" onSave={save} saver={saver} canEdit={canEdit} />
      </div>
    </Panel>
  )
}

const STATUS_HINT: Record<(typeof APP_STATUSES)[number], string> = {
  draft: 'Being set up. The App Review sign-in works only in this state.',
  live: 'On at least one store. The bundle id and package lock.',
  paused: 'The app opens but says the store is unavailable (e.g. an unpaid subscription). No new build needed.',
}

export function ReleaseTab({ tenantId, app, onSaved, canEdit }: TabProps) {
  const [form, setForm] = useState(() => ({
    status: app.status,
    minVersionIos: app.min_version_ios ?? '',
    latestVersionIos: app.latest_version_ios ?? '',
    minVersionAndroid: app.min_version_android ?? '',
    latestVersionAndroid: app.latest_version_android ?? '',
    appStoreUrl: app.app_store_url ?? '',
    playStoreUrl: app.play_store_url ?? '',
    ascAppId: app.asc_app_id ?? '',
    playTrack: app.play_track,
  }))
  const saver = useSaver()
  const patch = (next: Partial<typeof form>) => {
    setForm((current) => ({ ...current, ...next }))
    saver.setError(null)
    saver.setNotice(null)
  }
  const save = () => {
    const parsed = appReleaseInputSchema.safeParse(form)
    if (!parsed.success) return saver.setError(firstIssue(parsed.error))
    saver.start(async () => {
      const result = await saveAppReleaseAction(tenantId, form)
      if (!result.ok) return saver.setError(result.error)
      onSaved(result.data)
      saver.setNotice('Saved. Phones see it within a few minutes.')
    })
  }
  const input = (key: keyof typeof form, label: string, hint?: string, placeholder?: string) => (
    <Field label={label} htmlFor={`release-${key}`} hint={hint}>
      <input id={`release-${key}`} className={FIELD} value={form[key]} disabled={!canEdit} placeholder={placeholder} onChange={(event) => patch({ [key]: event.target.value })} />
    </Field>
  )

  return (
    <Panel>
      <SectionHeader title="Release" subtitle="Whether the app is live, and which builds may still open it." />
      <div className="mt-5 space-y-5">
        <fieldset>
          <legend className="mb-2 text-xs font-medium text-white/60">Status</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {APP_STATUSES.map((status) => (
              <label key={status} className="flex cursor-pointer gap-2 rounded-xl border border-white/10 p-3 text-sm text-white has-[:checked]:border-white/40 has-[:checked]:bg-white/[0.04]">
                <input type="radio" name="status" value={status} checked={form.status === status} disabled={!canEdit} onChange={() => patch({ status })} className="mt-0.5" />
                <span>
                  <span className="font-medium capitalize">{status}</span>
                  <span className="mt-0.5 block text-xs text-white/50">{STATUS_HINT[status]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          {input('latestVersionIos', 'iOS latest version', 'Older builds are asked to update.', '1.0.0')}
          {input('minVersionIos', 'iOS minimum version', 'Older builds must update to open.', '1.0.0')}
          {input('latestVersionAndroid', 'Android latest version', 'Older builds are asked to update.', '1.0.0')}
          {input('minVersionAndroid', 'Android minimum version', 'Older builds must update to open.', '1.0.0')}
          {input('appStoreUrl', 'App Store link', undefined, 'https://apps.apple.com/app/id…')}
          {input('playStoreUrl', 'Google Play link', undefined, 'https://play.google.com/store/apps/details?id=…')}
          {input('ascAppId', 'App Store Connect app id', 'The number in the app’s App Store Connect URL.')}
          <Field label="Play track" htmlFor="release-playTrack" hint="Where the next Android build goes.">
            <select id="release-playTrack" className={FIELD} value={form.playTrack} disabled={!canEdit} onChange={(event) => patch({ playTrack: event.target.value as typeof form.playTrack })}>
              {PLAY_TRACKS.map((track) => (
                <option key={track} value={track}>
                  {track}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <SaveRow label="Save release" onSave={save} saver={saver} canEdit={canEdit} />
      </div>
    </Panel>
  )
}
