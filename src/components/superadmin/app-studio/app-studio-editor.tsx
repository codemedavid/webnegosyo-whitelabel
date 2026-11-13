'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { ArrowLeft, Check, Loader2, Undo2, UploadCloud } from 'lucide-react'
import { discardAppDraftAction, publishAppDraftAction, saveAppDraftAction } from '@/app/actions/app-studio'
import { usePlatformAccess } from '@/components/superadmin/platform-access-context'
import { Panel, SectionHeader } from '@/components/superadmin/ui/primitives'
import { APP_CORNER_STYLES, APP_FONT_KEYS, type AppCatalog, type AppConfig } from '@/lib/app-contract'
import { previewConfig, sameDraft, type AppStudioDraft } from '@/lib/app-studio/home-draft'
import type { AppStudioApp } from '@/lib/app-studio/service'
import { cn } from '@/lib/utils'
import { BuildsTab } from './builds-tab'
import { HomeTab } from './home-tab'
import { IdentityTab } from './identity-tab'
import { ListingTab, ReleaseTab } from './listing-release-tabs'
import { PhonePreview, type PreviewAudience } from './phone-preview'
import { BUTTON, BUTTON_QUIET, Field, FIELD, STATUS_STYLE } from './studio-ui'

const TABS = [
  { id: 'identity', label: 'Identity' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'home', label: 'Home' },
  { id: 'listing', label: 'Store listing' },
  { id: 'release', label: 'Release' },
  { id: 'builds', label: 'Builds' },
] as const
type TabId = (typeof TABS)[number]['id']

const FONT_LABEL: Record<(typeof APP_FONT_KEYS)[number], string> = {
  jakarta: 'Plus Jakarta Sans',
  inter: 'Inter',
  poppins: 'Poppins',
  nunito: 'Nunito',
  fraunces: 'Fraunces (serif)',
}
const AUTOSAVE_MS = 1200

export interface AppStudioEditorProps {
  tenantId: string
  storeName: string
  storeSlug: string
  logoUrl: string | null
  app: AppStudioApp
  initialDraft: AppStudioDraft
  publishedDraft: unknown
  publishedVersion: number
  publishedAt: string | null
  base: AppConfig
  catalog: Pick<AppCatalog, 'categories' | 'items'>
}

type SaveState = 'saved' | 'saving' | 'unsaved' | 'error'

export function AppStudioEditor(props: AppStudioEditorProps) {
  const { tenantId, storeName, storeSlug, logoUrl, base, catalog } = props
  const router = useRouter()
  const canEdit = usePlatformAccess().can('customer_apps.edit')
  const [tab, setTab] = useState<TabId>('home')
  const [app, setApp] = useState(props.app)
  const [draft, setDraft] = useState<AppStudioDraft>(props.initialDraft)
  const [published, setPublished] = useState({ draft: props.publishedDraft, version: props.publishedVersion, at: props.publishedAt })
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [audience, setAudience] = useState<PreviewAudience>('guest')
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [isPublishing, startPublish] = useTransition()
  const lastSaved = useRef(props.initialDraft)

  // Autosave the draft a moment after the last edit. Nothing reaches customers until Publish.
  useEffect(() => {
    if (!canEdit || sameDraft(draft, lastSaved.current)) return
    setSaveState('unsaved')
    const timer = setTimeout(async () => {
      setSaveState('saving')
      const result = await saveAppDraftAction(tenantId, draft)
      if (result.ok) {
        lastSaved.current = draft
        setSaveState('saved')
      } else {
        setSaveState('error')
        setMessage({ tone: 'error', text: result.error })
      }
    }, AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [draft, tenantId, canEdit])

  const isPublishedNow = published.draft !== null && sameDraft(draft, published.draft)
  const config = previewConfig(base, draft)

  const publish = () =>
    startPublish(async () => {
      setMessage(null)
      const result = await publishAppDraftAction(tenantId, draft, published.version)
      if (!result.ok) return setMessage({ tone: 'error', text: result.error })
      lastSaved.current = draft
      setSaveState('saved')
      setPublished({ draft, version: result.data.version, at: result.data.publishedAt })
      setMessage({ tone: 'ok', text: `Published as version ${result.data.version}. Phones pick it up within a minute.` })
    })

  const discard = () =>
    startPublish(async () => {
      const result = await discardAppDraftAction(tenantId)
      if (!result.ok) return setMessage({ tone: 'error', text: result.error })
      router.refresh()
      setMessage({ tone: 'ok', text: 'Unpublished changes discarded.' })
    })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/superadmin/apps" className={BUTTON_QUIET} aria-label="Back to all apps">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-white/40">App Studio · {storeName}</p>
          <h1 className="truncate text-2xl font-semibold text-white">{app.display_name}</h1>
        </div>
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium capitalize', STATUS_STYLE[app.status])}>{app.status}</span>
        <SaveBadge state={saveState} isPublishedNow={isPublishedNow} />
        {canEdit && published.draft !== null && !isPublishedNow ? (
          <button type="button" className={BUTTON_QUIET} onClick={discard} disabled={isPublishing}>
            <Undo2 className="h-4 w-4" /> Discard changes
          </button>
        ) : null}
        {canEdit ? (
          <button type="button" className={BUTTON} onClick={publish} disabled={isPublishing || isPublishedNow}>
            {isPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            Publish
          </button>
        ) : null}
      </div>
      {message ? (
        <p role="status" className={cn('rounded-xl px-4 py-2.5 text-sm', message.tone === 'ok' ? 'bg-emerald-400/10 text-emerald-200' : 'bg-red-400/10 text-red-200')}>
          {message.text}
        </p>
      ) : null}
      <p className="text-xs text-white/40">
        {published.at ? `Live: version ${published.version}, published ${new Date(published.at).toLocaleString()}.` : 'Nothing published yet: the app shows a Home built from the store’s own banners and settings.'}{' '}
        Home, Appearance and wording save as a draft and reach phones only when you publish. Identity, listing and release save on their own.
      </p>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <nav className="flex flex-wrap gap-1 rounded-2xl border border-white/10 bg-white/[0.02] p-1" aria-label="App Studio sections">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                aria-current={tab === item.id ? 'page' : undefined}
                className={cn('rounded-xl px-3.5 py-2 text-sm font-medium', tab === item.id ? 'bg-white text-black' : 'text-white/60 hover:text-white')}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {tab === 'identity' ? <IdentityTab tenantId={tenantId} app={app} onSaved={setApp} canEdit={canEdit} logoUrl={logoUrl} /> : null}
          {tab === 'appearance' ? (
            <Panel>
              <SectionHeader title="Appearance" subtitle="Font and corners are the app’s own. Colours follow the store’s Branding Studio, so the web and the app always match." />
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Font" htmlFor="font">
                  <select
                    id="font"
                    className={FIELD}
                    disabled={!canEdit}
                    value={draft.theme?.fontKey ?? base.theme.fontKey}
                    onChange={(event) => setDraft({ ...draft, theme: { ...draft.theme, fontKey: event.target.value as (typeof APP_FONT_KEYS)[number] } })}
                  >
                    {APP_FONT_KEYS.map((key) => (
                      <option key={key} value={key}>
                        {FONT_LABEL[key]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Corners" htmlFor="corners">
                  <select
                    id="corners"
                    className={FIELD}
                    disabled={!canEdit}
                    value={draft.theme?.corners ?? base.theme.corners}
                    onChange={(event) => setDraft({ ...draft, theme: { ...draft.theme, corners: event.target.value as (typeof APP_CORNER_STYLES)[number] } })}
                  >
                    {APP_CORNER_STYLES.map((key) => (
                      <option key={key} value={key}>
                        {key[0].toUpperCase() + key.slice(1)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="mt-5">
                <p className="mb-2 text-xs font-medium text-white/60">Colours (from Branding Studio)</p>
                <div className="flex flex-wrap gap-2">
                  {(['primary', 'onPrimary', 'accent', 'background', 'surface', 'text', 'textMuted'] as const).map((key) => (
                    <div key={key} className="flex items-center gap-2 rounded-lg border border-white/10 px-2 py-1 text-xs text-white/70">
                      <span className="h-4 w-4 rounded border border-white/20" style={{ background: config.theme.colors[key] }} />
                      {key}
                    </div>
                  ))}
                </div>
                <a href={`/${storeSlug}/admin/branding`} className="mt-3 inline-block text-xs text-sky-300 hover:underline" target="_blank" rel="noreferrer">
                  Edit colours in Branding Studio
                </a>
              </div>
            </Panel>
          ) : null}
          {tab === 'home' ? (
            <HomeTab
              tenantId={tenantId}
              draft={draft}
              onChange={setDraft}
              base={base}
              catalog={catalog}
              canEdit={canEdit}
              selectedBlockId={selectedBlockId}
              onSelectBlock={setSelectedBlockId}
            />
          ) : null}
          {tab === 'listing' ? <ListingTab tenantId={tenantId} app={app} onSaved={setApp} canEdit={canEdit} /> : null}
          {tab === 'release' ? <ReleaseTab tenantId={tenantId} app={app} onSaved={setApp} canEdit={canEdit} /> : null}
          {tab === 'builds' ? <BuildsTab tenantId={tenantId} canEdit={canEdit} /> : null}
        </div>

        <aside className="space-y-3 xl:sticky xl:top-6 xl:self-start">
          <div className="flex justify-center gap-1 rounded-xl border border-white/10 p-1 text-xs" role="group" aria-label="Preview as">
            {(['guest', 'member'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setAudience(value)}
                aria-pressed={audience === value}
                className={cn('flex-1 rounded-lg px-3 py-1.5 font-medium', audience === value ? 'bg-white text-black' : 'text-white/60')}
              >
                {value === 'guest' ? 'Signed out' : 'Member'}
              </button>
            ))}
          </div>
          <PhonePreview config={config} catalog={catalog} storeName={storeName} logoUrl={logoUrl} audience={audience} selectedBlockId={tab === 'home' ? selectedBlockId : null} />
          <p className="text-center text-xs text-white/40">A close look-alike of the app’s Home. Check exact spacing on a phone.</p>
        </aside>
      </div>
    </div>
  )
}

function SaveBadge({ state, isPublishedNow }: { state: SaveState; isPublishedNow: boolean }) {
  if (state === 'saving')
    return (
      <span className="flex items-center gap-1.5 text-xs text-white/50">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving draft
      </span>
    )
  if (state === 'error') return <span className="text-xs text-red-300">Draft not saved</span>
  if (state === 'unsaved') return <span className="text-xs text-white/50">Editing…</span>
  return (
    <span className="flex items-center gap-1.5 text-xs text-white/50">
      <Check className="h-3.5 w-3.5" /> {isPublishedNow ? 'Live version' : 'Draft saved'}
    </span>
  )
}
