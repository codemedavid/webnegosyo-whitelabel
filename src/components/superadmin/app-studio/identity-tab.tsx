'use client'

import { useState, useTransition } from 'react'
import { Copy, KeyRound, Loader2, Lock } from 'lucide-react'
import { clearAppReviewCodeAction, issueAppReviewCodeAction, saveAppIdentityAction } from '@/app/actions/app-studio'
import { Panel, SectionHeader } from '@/components/superadmin/ui/primitives'
import { APP_NAME_MAX, HOME_SCREEN_NAME_VISIBLE, STORE_ACCOUNTS, appIdentityInputSchema, firstIssue, reviewPhoneSchema } from '@/lib/app-studio/inputs'
import type { AppStudioApp } from '@/lib/app-studio/service'
import { BUTTON, BUTTON_QUIET, Counter, Field, FIELD, ImageField } from './studio-ui'

interface TabProps {
  tenantId: string
  app: AppStudioApp
  onSaved: (app: AppStudioApp) => void
  canEdit: boolean
}

const ACCOUNT_LABEL: Record<(typeof STORE_ACCOUNTS)[number], string> = { webnegosyo: 'WebNegosyo’s account', tenant: 'The store’s own account' }

export function IdentityTab({ tenantId, app, onSaved, canEdit, logoUrl }: TabProps & { logoUrl: string | null }) {
  const [form, setForm] = useState(() => ({
    displayName: app.display_name,
    bundleId: app.bundle_id,
    androidPackage: app.android_package,
    iconUrl: app.icon_url,
    splashUrl: app.splash_url,
    splashBackground: app.splash_background ?? '',
    storeAccount: (app.store_account ?? { apple: 'webnegosyo', google: 'webnegosyo' }) as { apple: 'webnegosyo' | 'tenant'; google: 'webnegosyo' | 'tenant' },
  }))
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isSaving, startSave] = useTransition()
  const idsLocked = app.status !== 'draft'
  const folder = `customer-apps/${tenantId}`
  const patch = (next: Partial<typeof form>) => {
    setForm((current) => ({ ...current, ...next }))
    setError(null)
    setNotice(null)
  }

  const save = () => {
    const parsed = appIdentityInputSchema.safeParse(form)
    if (!parsed.success) return setError(firstIssue(parsed.error))
    startSave(async () => {
      const result = await saveAppIdentityAction(tenantId, form)
      if (!result.ok) return setError(result.error)
      onSaved(result.data)
      setNotice('Saved.')
    })
  }

  return (
    <div className="space-y-4">
      <Panel>
        <SectionHeader title="Identity" subtitle="What the app is called and how it looks on a phone’s home screen. Used by the next store build." />
        <div className="mt-5 space-y-5">
          <Field
            label="App name"
            htmlFor="app-name"
            hint={
              form.displayName.length > HOME_SCREEN_NAME_VISIBLE
                ? `Phones show about ${HOME_SCREEN_NAME_VISIBLE} characters under the icon: “${form.displayName.slice(0, HOME_SCREEN_NAME_VISIBLE)}…”.`
                : 'Shown under the icon and on the store listing.'
            }
          >
            <div className="relative">
              <input id="app-name" className={FIELD} value={form.displayName} maxLength={APP_NAME_MAX} disabled={!canEdit} onChange={(event) => patch({ displayName: event.target.value })} />
              <span className="absolute right-3 top-2.5">
                <Counter value={form.displayName} max={APP_NAME_MAX} warnAt={HOME_SCREEN_NAME_VISIBLE} />
              </span>
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="iOS bundle id" htmlFor="bundle-id" hint={idsLocked ? 'Locked: the app has gone live.' : 'Its identity on the App Store. Locked once live.'}>
              <div className="relative">
                <input id="bundle-id" className={FIELD} value={form.bundleId} disabled={!canEdit || idsLocked} onChange={(event) => patch({ bundleId: event.target.value })} />
                {idsLocked ? <Lock className="absolute right-3 top-2.5 h-4 w-4 text-white/30" /> : null}
              </div>
            </Field>
            <Field label="Android package" htmlFor="android-package" hint={idsLocked ? 'Locked: the app has gone live.' : 'Its identity on Google Play. Locked once live.'}>
              <div className="relative">
                <input id="android-package" className={FIELD} value={form.androidPackage} disabled={!canEdit || idsLocked} onChange={(event) => patch({ androidPackage: event.target.value })} />
                {idsLocked ? <Lock className="absolute right-3 top-2.5 h-4 w-4 text-white/30" /> : null}
              </div>
            </Field>
          </div>
          <ImageField
            label="App icon"
            hint="Square, at least 1024×1024, PNG or JPG, no see-through areas. Phones round the corners themselves."
            value={form.iconUrl}
            onChange={(iconUrl) => patch({ iconUrl })}
            folder={folder}
            rules={{ minSquare: 1024, isOpaque: true }}
            disabled={!canEdit}
          />
          {canEdit && logoUrl && !form.iconUrl ? (
            <p className="-mt-3 text-xs text-white/40">
              Tip: download the store logo and upload it here if it is square and at least 1024 pixels.{' '}
              <a href={logoUrl} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">
                Open the logo
              </a>
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
            <ImageField
              label="Splash image"
              hint="Shown centred while the app opens, about 180 pixels wide. A logo on a plain background works best."
              value={form.splashUrl}
              onChange={(splashUrl) => patch({ splashUrl })}
              folder={folder}
              disabled={!canEdit}
              shape="tall"
            />
            <Field label="Splash background" htmlFor="splash-bg" hint="Like #1A2B3C">
              <div className="flex gap-2">
                <input
                  type="color"
                  aria-label="Pick the splash background"
                  value={/^#[0-9A-Fa-f]{6}$/.test(form.splashBackground) ? form.splashBackground : '#ffffff'}
                  disabled={!canEdit}
                  onChange={(event) => patch({ splashBackground: event.target.value })}
                  className="h-9 w-10 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                />
                <input id="splash-bg" className={FIELD} value={form.splashBackground} disabled={!canEdit} onChange={(event) => patch({ splashBackground: event.target.value })} />
              </div>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(['apple', 'google'] as const).map((store) => (
              <Field key={store} label={store === 'apple' ? 'Published on the App Store by' : 'Published on Google Play by'} htmlFor={`account-${store}`}>
                <select
                  id={`account-${store}`}
                  className={FIELD}
                  disabled={!canEdit}
                  value={form.storeAccount[store]}
                  onChange={(event) => patch({ storeAccount: { ...form.storeAccount, [store]: event.target.value as 'webnegosyo' | 'tenant' } })}
                >
                  {STORE_ACCOUNTS.map((account) => (
                    <option key={account} value={account}>
                      {ACCOUNT_LABEL[account]}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          {canEdit ? (
            <div className="flex items-center gap-3">
              <button type="button" className={BUTTON} onClick={save} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save identity
              </button>
              {error ? <p className="text-sm text-red-300">{error}</p> : notice ? <p className="text-sm text-emerald-300">{notice}</p> : null}
            </div>
          ) : null}
        </div>
      </Panel>
      <ReviewSignIn tenantId={tenantId} app={app} onSaved={onSaved} canEdit={canEdit} />
    </div>
  )
}

/** The App Review number and its code: the code is shown once, only its hash is kept. */
function ReviewSignIn({ tenantId, app, onSaved, canEdit }: TabProps) {
  const [phone, setPhone] = useState(app.review_phone_e164 ?? '')
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, startBusy] = useTransition()

  const issue = () => {
    const parsed = reviewPhoneSchema.safeParse(phone)
    if (!parsed.success) return setError(firstIssue(parsed.error))
    startBusy(async () => {
      const result = await issueAppReviewCodeAction(tenantId, parsed.data)
      if (!result.ok) return setError(result.error)
      onSaved(result.data.app)
      setCode(result.data.code)
      setError(null)
    })
  }

  const clear = () =>
    startBusy(async () => {
      const result = await clearAppReviewCodeAction(tenantId)
      if (!result.ok) return setError(result.error)
      onSaved(result.data)
      setCode(null)
      setPhone('')
    })

  return (
    <Panel>
      <SectionHeader
        title="App Review sign-in"
        subtitle="Apple’s reviewers can’t receive our texts. Give them this number and code in App Store Connect. It works only while the app is a draft, and no text is ever sent to it."
      />
      <div className="mt-5 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Field label="Review number" htmlFor="review-phone" hint="A PH mobile like +639990000123. Use a number nobody owns.">
              <input id="review-phone" className={FIELD} value={phone} disabled={!canEdit} onChange={(event) => setPhone(event.target.value)} placeholder="+639990000123" />
            </Field>
          </div>
          {canEdit ? (
            <button type="button" className={BUTTON} onClick={issue} disabled={isBusy}>
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {app.hasReviewCode ? 'Make a new code' : 'Make a code'}
            </button>
          ) : null}
          {canEdit && app.hasReviewCode ? (
            <button type="button" className={BUTTON_QUIET} onClick={clear} disabled={isBusy}>
              Remove
            </button>
          ) : null}
        </div>
        {code ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.06] p-4">
            <div>
              <p className="text-xs text-emerald-200/80">Code for {app.review_phone_e164}. Copy it now: it is shown only this once.</p>
              <p className="mt-1 font-mono text-2xl tracking-[0.3em] text-white">{code}</p>
            </div>
            <button type="button" className={BUTTON_QUIET} onClick={() => void navigator.clipboard?.writeText(code)}>
              <Copy className="h-4 w-4" /> Copy
            </button>
          </div>
        ) : app.hasReviewCode ? (
          <p className="text-xs text-white/50">A code is set for {app.review_phone_e164}. Make a new one if you no longer have it.</p>
        ) : (
          <p className="text-xs text-white/50">No review sign-in yet.</p>
        )}
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
      </div>
    </Panel>
  )
}
