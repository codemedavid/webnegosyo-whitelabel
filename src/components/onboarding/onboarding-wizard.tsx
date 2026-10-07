'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Loader2, Lock, Sparkles } from 'lucide-react'
import { MIN_OWNER_PASSWORD, MAX_OWNER_PASSWORD } from '@/lib/onboarding/answers'
import type { OnboardingAssets } from '@/lib/onboarding/repository'
import type { OnboardingView } from '@/lib/onboarding/view'
import { removeOnboardingPhoto, submitOnboarding, uploadOnboardingPhoto } from './onboarding-api'
import { Field, INPUT_CLASS, ONBOARDING_COLORS, PrimaryButton } from './onboarding-ui'
import { HoursStep, MenuStep, OrderingStep, StoreStep } from './wizard-steps'
import { WIZARD_STEPS, draftToAnswers, emptyDraft, stepBlocker, type WizardDraft, type WizardStep } from './wizard-draft'

const STEP_TITLES: Record<WizardStep, { title: string; subtitle: string }> = {
  store: { title: 'Your store', subtitle: 'The name and look your customers will see.' },
  menu: { title: 'Your menu', subtitle: 'Snap your menu — we type it in for you.' },
  ordering: { title: 'Ordering & payment', subtitle: 'How customers order and pay you.' },
  hours: { title: 'Opening hours', subtitle: 'So nobody orders while you are closed.' },
  account: { title: 'Your login', subtitle: 'You will use this to manage your store.' },
}

const draftKey = (token: string) => `onboarding-draft:${token.slice(0, 12)}`

function readSavedDraft(token: string, fallback: WizardDraft): WizardDraft {
  try {
    const raw = window.localStorage.getItem(draftKey(token))
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<WizardDraft>) } : fallback
  } catch {
    return fallback
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

function AccountStep({ email, password, setPassword }: { email: string; password: string; setPassword: (v: string) => void }) {
  return (
    <div className="space-y-5">
      <Field label="Login email">
        <input className={`${INPUT_CLASS} bg-black/[0.03]`} value={email} readOnly />
      </Field>
      <Field label="Choose a password" hint={`At least ${MIN_OWNER_PASSWORD} characters.`}>
        <input
          type="password"
          autoComplete="new-password"
          className={INPUT_CLASS}
          value={password}
          maxLength={MAX_OWNER_PASSWORD}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <p className="flex items-start gap-2 rounded-xl p-3 text-xs" style={{ backgroundColor: ONBOARDING_COLORS.cream, color: ONBOARDING_COLORS.cocoa }}>
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Your store stays private while we confirm your payment. You can review everything before it opens.
      </p>
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

  // Restore after mount (never during render: localStorage is browser-only).
  useEffect(() => setDraft((current) => readSavedDraft(token, current)), [token])

  const step = WIZARD_STEPS[stepIndex]
  const isLastStep = stepIndex === WIZARD_STEPS.length - 1

  function update(patch: Partial<WizardDraft>) {
    setDraft((current) => {
      const next = { ...current, ...patch }
      saveDraft(token, next)
      return next
    })
    setError(null)
  }

  async function uploadPhoto(kind: 'logo' | 'menu', file: File): Promise<string | null> {
    const result = await uploadOnboardingPhoto(token, kind, file)
    if (!result.ok) return result.error
    setAssets({ logoUrl: result.data.logoUrl ?? null, menuImageUrls: result.data.menuImageUrls ?? [] })
    return null
  }

  async function removePhoto(kind: 'logo' | 'menu', index = 0): Promise<string | null> {
    const result = await removeOnboardingPhoto(token, kind, index)
    if (!result.ok) return result.error
    setAssets({ logoUrl: result.data.logoUrl ?? null, menuImageUrls: result.data.menuImageUrls ?? [] })
    return null
  }

  async function submit() {
    const mapped = draftToAnswers(draft)
    if (!mapped.ok) return setError(mapped.error)
    if (password.length < MIN_OWNER_PASSWORD) return setError(`Use at least ${MIN_OWNER_PASSWORD} characters for your password`)

    setIsSubmitting(true)
    const result = await submitOnboarding(token, mapped.answers, password)
    setIsSubmitting(false)
    if (!result.ok) return setError(result.error)
    onSubmitted()
  }

  function next() {
    const blocker = stepBlocker(step, draft, assets.menuImageUrls.length)
    if (blocker) return setError(blocker)
    if (isLastStep) return void submit()
    setStepIndex((index) => index + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const stepProps = { draft, update }
  const photoProps = { assets, uploadPhoto, removePhoto }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex gap-1.5" aria-hidden>
          {WIZARD_STEPS.map((id, index) => (
            <span key={id} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: index <= stepIndex ? ONBOARDING_COLORS.red : 'rgba(0,0,0,0.1)' }} />
          ))}
        </div>
        <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: ONBOARDING_COLORS.red }}>
          Step {stepIndex + 1} of {WIZARD_STEPS.length}
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight" style={{ color: ONBOARDING_COLORS.ink }}>{STEP_TITLES[step].title}</h1>
        <p className="mt-1 text-sm" style={{ color: ONBOARDING_COLORS.cocoa }}>{STEP_TITLES[step].subtitle}</p>
      </div>

      {step === 'store' && <StoreStep {...stepProps} {...photoProps} />}
      {step === 'menu' && <MenuStep {...stepProps} {...photoProps} />}
      {step === 'ordering' && <OrderingStep {...stepProps} />}
      {step === 'hours' && <HoursStep {...stepProps} />}
      {step === 'account' && <AccountStep email={view.ownerEmail} password={password} setPassword={setPassword} />}

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-800">{error}</p>}

      <div className="flex items-center gap-3">
        {stepIndex > 0 && (
          <button
            type="button"
            onClick={() => setStepIndex((index) => index - 1)}
            aria-label="Back"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-black/15 bg-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <PrimaryButton onClick={next} isDisabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : isLastStep ? <Sparkles className="h-5 w-5" aria-hidden /> : null}
          {isLastStep ? (isSubmitting ? 'Creating your store…' : 'Build my store') : 'Continue'}
        </PrimaryButton>
      </div>
    </div>
  )
}
