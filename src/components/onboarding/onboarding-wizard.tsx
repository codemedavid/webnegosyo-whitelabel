'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Eye, Loader2, X } from 'lucide-react'
import { MIN_OWNER_PASSWORD } from '@/lib/onboarding/answers'
import { STORE_TYPES } from '@/lib/onboarding/store-type'
import type { OnboardingAssets } from '@/lib/onboarding/repository'
import type { OnboardingView } from '@/lib/onboarding/view'
import { removeOnboardingPhoto, signInNewOwner, submitOnboarding, uploadOnboardingPhoto } from './onboarding-api'
import { ACCENT, ACCENT_SOFT, ErrorNote, FOCUS_RING, OB, PrimaryButton, TextButton } from './onboarding-ui'
import { accentStyle, resolveBrandColor } from './onboarding-theme'
import { StorePreviewPhone, type StorePreviewProps } from './store-preview-phone'
import { previewMenuRows } from './preview-menu'
import { BrandStep, MenuStep, StoreStep, WelcomeStep } from './wizard-steps'
import { AccountStep, HoursStep, OrderingStep } from './wizard-steps-setup'
import { WIZARD_STEPS, draftToAnswers, emptyDraft, restoreDraft, stepBlocker, type WizardDraft, type WizardStep } from './wizard-draft'

/** Steps the progress bar counts (the welcome screen is not a question). */
const QUESTION_STEPS = WIZARD_STEPS.filter((step) => step !== 'welcome')

const STEP_EASE = [0.16, 1, 0.3, 1] as const
const STEP_SHIFT_PX = 28

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

/** Airbnb's footer progress: one segment per question, filled as you go. */
function ProgressBar({ step }: { step: WizardStep }) {
  const index = QUESTION_STEPS.indexOf(step as (typeof QUESTION_STEPS)[number])
  return (
    <div className="flex gap-1.5" role="progressbar" aria-label="Set-up progress" aria-valuemin={0} aria-valuemax={QUESTION_STEPS.length} aria-valuenow={Math.max(index, 0)}>
      {QUESTION_STEPS.map((id, position) => (
        <span key={id} className="h-1 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: OB.line }}>
          <span
            className="block h-full rounded-full transition-[width] duration-500 ease-out"
            style={{ width: position < index ? '100%' : position === index ? '50%' : '0%', backgroundColor: ACCENT }}
          />
        </span>
      ))}
    </div>
  )
}

/** Phones see the store on demand, in a sheet over the form. */
function MobilePreviewSheet({ isOpen, onClose, children }: { isOpen: boolean; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    if (!isOpen) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end bg-black/40 lg:hidden"
          role="dialog" aria-modal="true" aria-label="Store preview"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl px-5 pb-8 pt-3"
            style={{ backgroundColor: ACCENT_SOFT }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ duration: 0.35, ease: STEP_EASE }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-black/15" aria-hidden />
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[15px] font-semibold" style={{ color: OB.ink }}>Your store, as you build it</p>
              <button type="button" onClick={onClose} aria-label="Close preview" className={`flex h-10 w-10 items-center justify-center rounded-full bg-white ${FOCUS_RING}`}>
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="mx-auto max-w-[270px]">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

interface OnboardingWizardProps {
  token: string
  view: OnboardingView
  /** Hands over the preview the owner built, so the build screen keeps showing it. */
  onSubmitted: (preview: StorePreviewProps) => void
}

export function OnboardingWizard({ token, view, onSubmitted }: OnboardingWizardProps) {
  const [draft, setDraft] = useState<WizardDraft>(() => emptyDraft(view.businessName))
  const [assets, setAssets] = useState<Required<OnboardingAssets>>(view.assets)
  const [stepIndex, setStepIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(view.error)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const headingRef = useRef<HTMLDivElement>(null)
  const isReducedMotion = useReducedMotion()

  // Restore after mount (never during render: localStorage is browser-only).
  useEffect(() => setDraft((current) => readSavedDraft(token, current)), [token])

  const step = WIZARD_STEPS[stepIndex]
  const isWelcome = step === 'welcome'
  const isLastStep = stepIndex === WIZARD_STEPS.length - 1
  const brand = resolveBrandColor(draft.brandColor, assets.logoColor, draft.storeType)
  // Until the build reads the menu, an AI pick previews as the store type's own look.
  const look = draft.look || (draft.storeType ? STORE_TYPES[draft.storeType].look : 'shop')

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
    onSubmitted(previewProps)
  }

  function goTo(nextIndex: number) {
    setDirection(nextIndex > stepIndex ? 1 : -1)
    setStepIndex(nextIndex)
    setError(null)
    window.scrollTo({ top: 0, behavior: isReducedMotion ? 'auto' : 'smooth' })
  }

  function next() {
    if (isSubmitting) return
    const blocker = stepBlocker(step, draft, assets.menuImageUrls.length)
    if (blocker) return setError(blocker)
    if (isLastStep) return void submit()
    goTo(stepIndex + 1)
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    next()
  }

  // Move focus to the new question so screen readers announce it.
  useEffect(() => {
    if (stepIndex > 0) headingRef.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true })
  }, [stepIndex])

  const previewProps: StorePreviewProps = {
    storeName: draft.storeName,
    tagline: draft.tagline,
    storeType: draft.storeType,
    brand: brand ?? OB.ink,
    logoUrl: assets.logoUrl,
    rows: previewMenuRows(draft.menuText, draft.bestSellers),
    look,
  }
  const preview = <StorePreviewPhone {...previewProps} />
  const stepProps = { draft, update }
  const photoProps = { assets, uploadPhoto, removePhoto }
  const continueLabel = isWelcome ? 'Get started' : isLastStep ? (isSubmitting ? 'Building…' : 'Build my store') : 'Next'
  const shift = isReducedMotion ? 0 : STEP_SHIFT_PX * direction

  return (
    <form onSubmit={handleSubmit} noValidate style={accentStyle(brand, draft.storeType)} className="lg:grid lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 px-5 pb-40 pt-6 sm:px-8 lg:flex lg:items-start lg:justify-center lg:px-12 lg:pb-36 lg:pt-14">
        <div className="mx-auto w-full max-w-[34rem]">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={step}
              ref={headingRef}
              initial={{ opacity: 0, x: shift }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -shift }}
              transition={{ duration: 0.28, ease: STEP_EASE }}
              className="[&_h1]:outline-none"
            >
              {step === 'welcome' && <WelcomeStep firstName={view.ownerFirstName} businessName={view.businessName} isPaid={view.isPaymentConfirmed} />}
              {step === 'store' && <StoreStep {...stepProps} />}
              {step === 'brand' && <BrandStep {...stepProps} {...photoProps} brand={brand ?? OB.ink} />}
              {step === 'menu' && <MenuStep {...stepProps} {...photoProps} />}
              {step === 'ordering' && <OrderingStep {...stepProps} />}
              {step === 'hours' && <HoursStep {...stepProps} />}
              {step === 'account' && <AccountStep email={view.ownerEmail} password={password} setPassword={setPassword} />}
            </motion.div>
          </AnimatePresence>
          {error && <div className="mt-6"><ErrorNote>{error}</ErrorNote></div>}
        </div>
      </div>

      <aside className="hidden lg:block lg:p-4 lg:pb-28" aria-label="Live preview of your store">
        <div className="sticky top-4 flex h-[calc(100dvh-9rem)] min-h-[560px] flex-col items-center justify-center rounded-3xl transition-colors duration-700" style={{ backgroundColor: ACCENT_SOFT }}>
          <div className="w-full max-w-[290px]">{preview}</div>
          <p className="mt-5 flex items-center gap-2 text-[13px] font-medium" style={{ color: OB.muted }}>
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Updates as you answer
          </p>
        </div>
      </aside>

      <footer className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 backdrop-blur" style={{ borderColor: OB.line }}>
        {!isWelcome && <ProgressBar step={step} />}
        <div className="mx-auto flex h-[4.75rem] items-center gap-3 px-5 sm:px-8">
          {stepIndex > 0 ? <TextButton onClick={() => goTo(stepIndex - 1)}>Back</TextButton> : <span />}
          <div className={`ml-auto flex items-center gap-2 ${isWelcome ? 'w-full sm:w-auto [&>button]:w-full sm:[&>button]:w-auto' : ''}`}>
            {!isWelcome && (
              <button type="button" onClick={() => setIsPreviewOpen(true)}
                className={`inline-flex min-h-12 items-center gap-2 rounded-xl border px-4 text-[15px] font-semibold lg:hidden ${FOCUS_RING}`}
                style={{ borderColor: OB.lineStrong, color: OB.ink }}>
                <Eye className="h-4 w-4" aria-hidden /> Preview
              </button>
            )}
            <PrimaryButton type="submit" isDisabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {continueLabel}
              {!isLastStep && !isSubmitting && <ArrowRight className="h-4 w-4" aria-hidden />}
            </PrimaryButton>
          </div>
        </div>
      </footer>

      <MobilePreviewSheet isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)}>{preview}</MobilePreviewSheet>
    </form>
  )
}
