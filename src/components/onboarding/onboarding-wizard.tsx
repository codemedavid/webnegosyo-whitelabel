'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Eye, Loader2, Sparkles, X } from 'lucide-react'
import { MIN_OWNER_PASSWORD } from '@/lib/onboarding/answers'
import { STORE_TYPES } from '@/lib/onboarding/store-type'
import type { OnboardingAssets } from '@/lib/onboarding/repository'
import type { OnboardingView } from '@/lib/onboarding/view'
import { removeOnboardingPhoto, signInNewOwner, submitOnboarding, uploadOnboardingPhoto } from './onboarding-api'
import { ACCENT, DISPLAY_FONT, Eyebrow, ONBOARDING_COLORS, PrimaryButton } from './onboarding-ui'
import { accentStyle, resolveBrandColor } from './onboarding-theme'
import { StorePreviewPhone } from './store-preview-phone'
import { previewMenuRows } from './preview-menu'
import { BrandStep, MenuStep, StoreStep, WelcomeStep } from './wizard-steps'
import { AccountStep, HoursStep, OrderingStep } from './wizard-steps-setup'
import { WIZARD_STEPS, draftToAnswers, emptyDraft, restoreDraft, stepBlocker, type WizardDraft, type WizardStep } from './wizard-draft'

const STEP_TITLES: Record<WizardStep, { title: string; subtitle: string }> = {
  welcome: { title: '', subtitle: '' },
  store: { title: 'Tell us about your store', subtitle: 'The name and kind of store your customers will see.' },
  brand: { title: 'Make it yours', subtitle: 'Your logo and color — applied to your store the moment you pick them.' },
  menu: { title: 'Your menu', subtitle: 'Snap it. We type every dish and price for you.' },
  ordering: { title: 'Ordering & payment', subtitle: 'How customers get their food and pay you.' },
  hours: { title: 'Opening hours', subtitle: 'So nobody orders while you are closed.' },
  account: { title: 'Your login', subtitle: 'One last thing — then we build your store.' },
}

/** Steps the progress bar counts (the welcome screen is not a question). */
const QUESTION_STEPS = WIZARD_STEPS.filter((step) => step !== 'welcome')

const draftKey = (token: string) => `onboarding-draft:${token.slice(0, 12)}`

function readSavedDraft(token: string, fallback: WizardDraft): WizardDraft {
  try {
    const raw = window.localStorage.getItem(draftKey(token))
    return raw ? restoreDraft(fallback, JSON.parse(raw)) : fallback
  } catch {
    return fallback
  }
}

/** The draft holds wallet numbers and names; drop it once the server has the answers. */
function clearSavedDraft(token: string): void {
  try {
    window.localStorage.removeItem(draftKey(token))
  } catch {
    // Storage unavailable: nothing was saved either.
  }
}

function saveDraft(token: string, draft: WizardDraft): void {
  try {
    window.localStorage.setItem(draftKey(token), JSON.stringify(draft))
  } catch {
    // Private mode or full storage: the wizard still works, it just won't survive a reload.
  }
}

interface OnboardingWizardProps {
  token: string
  view: OnboardingView
  onSubmitted: () => void
}

function ProgressHeader({ step }: { step: WizardStep }) {
  const index = QUESTION_STEPS.indexOf(step as (typeof QUESTION_STEPS)[number])
  return (
    <div>
      <div className="flex gap-1.5" aria-hidden>
        {QUESTION_STEPS.map((id, position) => (
          <span key={id} className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/10">
            <span className="block h-full rounded-full transition-all duration-500" style={{ width: position <= index ? '100%' : '0%', backgroundColor: ACCENT }} />
          </span>
        ))}
      </div>
      <div className="mt-5">
        <Eyebrow>Step {index + 1} of {QUESTION_STEPS.length}</Eyebrow>
        <h1 className="mt-1.5 text-[1.9rem] font-extrabold leading-tight tracking-tight" style={{ color: ONBOARDING_COLORS.ink, fontFamily: DISPLAY_FONT }}>
          {STEP_TITLES[step].title}
        </h1>
        <p className="mt-1 text-[15px]" style={{ color: ONBOARDING_COLORS.cocoa }}>{STEP_TITLES[step].subtitle}</p>
      </div>
    </div>
  )
}

/** Phones show the preview on demand, in a sheet over the form. */
function MobilePreviewSheet({ isOpen, onClose, children }: { isOpen: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm lg:hidden" role="dialog" aria-modal="true" aria-label="Store preview" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-[2rem] p-5 pb-8" style={{ backgroundColor: ONBOARDING_COLORS.cream }} onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-bold" style={{ color: ONBOARDING_COLORS.ink }}>Your store, live as you type</p>
          <button type="button" onClick={onClose} aria-label="Close preview" className="flex h-9 w-9 items-center justify-center rounded-full bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mx-auto max-w-[260px]">{children}</div>
      </div>
    </div>
  )
}

export function OnboardingWizard({ token, view, onSubmitted }: OnboardingWizardProps) {
  const [draft, setDraft] = useState<WizardDraft>(() => emptyDraft(view.businessName))
  const [assets, setAssets] = useState<Required<OnboardingAssets>>(view.assets)
  const [stepIndex, setStepIndex] = useState(0)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(view.error)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

  // Restore after mount (never during render: localStorage is browser-only).
  useEffect(() => setDraft((current) => readSavedDraft(token, current)), [token])

  const step = WIZARD_STEPS[stepIndex]
  const isWelcome = step === 'welcome'
  const isLastStep = stepIndex === WIZARD_STEPS.length - 1
  const brand = resolveBrandColor(draft.brandColor, assets.logoColor, draft.storeType)
  const typeColor = draft.storeType ? STORE_TYPES[draft.storeType].defaultColor : null

  function update(patch: Partial<WizardDraft>) {
    setDraft((current) => {
      const next = { ...current, ...patch }
      saveDraft(token, next)
      return next
    })
    setError(null)
  }

  function applyAssets(next: OnboardingAssets) {
    setAssets({ logoUrl: next.logoUrl ?? null, logoColor: next.logoColor ?? null, menuImageUrls: next.menuImageUrls ?? [] })
  }

  async function uploadPhoto(kind: 'logo' | 'menu', file: File): Promise<string | null> {
    const result = await uploadOnboardingPhoto(token, kind, file)
    if (!result.ok) return result.error
    applyAssets(result.data)
    return null
  }

  async function removePhoto(kind: 'logo' | 'menu', index = 0): Promise<string | null> {
    const result = await removeOnboardingPhoto(token, kind, index)
    if (!result.ok) return result.error
    applyAssets(result.data)
    return null
  }

  async function submit() {
    // An explicit pick, or the logo color the owner saw in the preview: what they saw is what they get.
    const mapped = draftToAnswers({ ...draft, brandColor: draft.brandColor || assets.logoColor || '' })
    if (!mapped.ok) return setError(mapped.error)
    if (password.length < MIN_OWNER_PASSWORD) return setError(`Use at least ${MIN_OWNER_PASSWORD} characters for your password`)

    setIsSubmitting(true)
    const result = await submitOnboarding(token, mapped.answers, password)
    if (!result.ok) {
      setIsSubmitting(false)
      return setError(result.error)
    }
    clearSavedDraft(token)
    // The login exists now: sign in, so the dashboard opens without a password prompt.
    await signInNewOwner(view.ownerEmail, password)
    onSubmitted()
  }

  function next() {
    const blocker = stepBlocker(step, draft, assets.menuImageUrls.length)
    if (blocker) return setError(blocker)
    if (isLastStep) return void submit()
    setStepIndex((index) => index + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function back() {
    setError(null)
    setStepIndex((index) => Math.max(0, index - 1))
  }

  const preview = (
    <StorePreviewPhone
      storeName={draft.storeName}
      tagline={draft.tagline}
      storeType={draft.storeType}
      brand={brand ?? ONBOARDING_COLORS.red}
      logoUrl={assets.logoUrl}
      rows={previewMenuRows(draft.menuText, draft.bestSellers)}
      orderTypes={draft.orderTypes}
    />
  )
  const stepProps = { draft, update }
  const photoProps = { assets, uploadPhoto, removePhoto }
  const continueLabel = isWelcome ? "Let's build my store" : isLastStep ? (isSubmitting ? 'Creating your store…' : 'Build my store') : 'Continue'

  return (
    <div style={accentStyle(brand, draft.storeType)} className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-16">
      <div className="min-w-0 space-y-8 pb-28 lg:pb-0">
        {!isWelcome && <ProgressHeader step={step} />}

        <div key={step} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          {step === 'welcome' && <WelcomeStep firstName={view.ownerFirstName} businessName={view.businessName} isPaid={view.isPaymentConfirmed} />}
          {step === 'store' && <StoreStep {...stepProps} />}
          {step === 'brand' && <BrandStep {...stepProps} {...photoProps} brand={brand ?? ONBOARDING_COLORS.red} typeColor={typeColor} />}
          {step === 'menu' && <MenuStep {...stepProps} {...photoProps} />}
          {step === 'ordering' && <OrderingStep {...stepProps} />}
          {step === 'hours' && <HoursStep {...stepProps} />}
          {step === 'account' && <AccountStep email={view.ownerEmail} password={password} setPassword={setPassword} />}
        </div>

        {error && <p role="alert" className="rounded-2xl bg-red-50 p-3.5 text-sm font-medium text-red-800 ring-1 ring-red-200">{error}</p>}

        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-black/5 p-4 backdrop-blur-md lg:static lg:border-0 lg:p-0 lg:backdrop-blur-none" style={{ backgroundColor: 'color-mix(in srgb, #FBF6ED 88%, transparent)' }}>
          <div className="mx-auto flex max-w-xl items-center gap-3 lg:max-w-none">
            {stepIndex > 0 && (
              <button type="button" onClick={back} aria-label="Back" className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border border-black/10 bg-white transition hover:bg-black/[0.03]">
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            {!isWelcome && (
              <button type="button" onClick={() => setIsPreviewOpen(true)} aria-label="Preview your store"
                className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border border-black/10 bg-white lg:hidden">
                <Eye className="h-5 w-5" />
              </button>
            )}
            <PrimaryButton onClick={next} isDisabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
              {isLastStep && !isSubmitting && <Sparkles className="h-5 w-5" aria-hidden />}
              {continueLabel}
              {!isLastStep && <ArrowRight className="h-5 w-5" aria-hidden />}
            </PrimaryButton>
          </div>
        </div>
      </div>

      <aside className="hidden lg:block" aria-label="Live preview">
        <div className="sticky top-8">
          {preview}
          <p className="mt-4 text-center text-xs font-medium" style={{ color: ONBOARDING_COLORS.cocoa }}>
            <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500 align-middle" aria-hidden />
            Live preview — changes as you type
          </p>
        </div>
      </aside>

      <MobilePreviewSheet isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)}>{preview}</MobilePreviewSheet>
    </div>
  )
}
