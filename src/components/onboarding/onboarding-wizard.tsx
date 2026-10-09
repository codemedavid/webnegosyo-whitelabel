'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Eye, Loader2, X } from 'lucide-react'
import { MIN_OWNER_PASSWORD } from '@/lib/onboarding/answers'
import { STORE_TYPES } from '@/lib/onboarding/store-type'
import type { PublicOnboardingAssets } from '@/lib/onboarding/repository'
import type { MenuReadView } from '@/lib/onboarding/menu-read'
import type { OnboardingView } from '@/lib/onboarding/view'
import { removeOnboardingPhoto, signInNewOwner, submitOnboarding, trackOnboardingEvent, uploadOnboardingPhoto } from './onboarding-api'
import { ACCENT_SOFT, ErrorNote, FOCUS_RING, OB, PrimaryButton, TextButton } from './onboarding-ui'
import { accentStyle, resolveBrandColor } from './onboarding-theme'
import { StorePreviewPhone, type StorePreviewProps } from './store-preview-phone'
import { previewMenuRows, type PreviewMenuRow } from './preview-menu'
import { ChannelsStep, DailyOrdersStep, GoalsStep, PlanStep, TypicalOrderStep, WelcomeStep } from './wizard-about'
import { BrandStep, MenuStep, StoreStep } from './wizard-steps'
import { AccountStep, HoursStep, OrderingStep, PaymentsStep } from './wizard-steps-setup'
import { BestSellersStep } from './wizard-bestsellers'
import { ChapterProgress } from './wizard-progress'
import { useMenuRead } from './use-menu-read'
import {
  AUTO_ADVANCE_STEPS,
  WIZARD_STEPS,
  chapterOf,
  draftToAnswers,
  emptyDraft,
  firstUnansweredStep,
  restoreDraft,
  stepBlocker,
  type WizardDraft,
  type WizardStep,
} from './wizard-draft'

const STEP_EASE = [0.16, 1, 0.3, 1] as const
const STEP_SHIFT_PX = 28
/** Long enough to see the card light up, short enough to feel instant. */
const AUTO_ADVANCE_MS = 280
const MENU_STEP_INDEX = WIZARD_STEPS.indexOf('menu')
/** The phone only earns its space where answers change it. */
const PREVIEW_STEPS: ReadonlySet<WizardStep> = new Set(['brand', 'menu'])
const ABOUT_STEPS: ReadonlySet<WizardStep> = new Set(['welcome', 'goals', 'channels', 'daily', 'typical', 'plan'])
const PREVIEW_ROWS = 6

const draftKey = (token: string) => `onboarding-draft:${token.slice(0, 12)}`
const stepKey = (token: string) => `onboarding-step:${token.slice(0, 12)}`

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // Private mode or full storage: the wizard still works, it just won't survive a reload.
  }
}

function readSavedDraft(token: string, fallback: WizardDraft): WizardDraft {
  const raw = readStorage(draftKey(token))
  if (!raw) return fallback
  try {
    return restoreDraft(fallback, JSON.parse(raw))
  } catch {
    return fallback
  }
}

/** Resume where they left off, but never past a question they still have to answer. */
function resumeIndex(token: string, draft: WizardDraft, photoCount: number): number {
  const saved = WIZARD_STEPS.indexOf(readStorage(stepKey(token)) as WizardStep)
  if (saved <= 0) return 0
  return Math.min(saved, WIZARD_STEPS.indexOf(firstUnansweredStep(draft, photoCount)))
}

/** "About you · 2 of 5". */
function eyebrowFor(step: WizardStep): string {
  const chapter = chapterOf(step)
  if (!chapter) return ''
  if (chapter.steps.length === 1) return chapter.label
  return `${chapter.label} · ${(chapter.steps as readonly WizardStep[]).indexOf(step) + 1} of ${chapter.steps.length}`
}

function continueLabel(step: WizardStep, isSubmitting: boolean): string {
  if (step === 'welcome') return "Let's go"
  if (step === 'plan') return 'Sounds good'
  if (step === 'account') return isSubmitting ? 'Building…' : 'Build my store'
  return 'Continue'
}

/** The real dishes once the menu is read; until then, what the owner typed. */
function previewRows(read: MenuReadView, draft: WizardDraft): PreviewMenuRow[] {
  if (read.status !== 'done' || read.dishes.length === 0) return previewMenuRows(draft.menuText, draft.bestSellers)
  const picked = new Set(draft.bestSellers.map((name) => name.trim().toLowerCase()).filter(Boolean))
  const rows = read.dishes.map((dish) => ({ name: dish.name, price: String(dish.price), isBestSeller: picked.has(dish.name.toLowerCase()) }))
  return [...rows.filter((row) => row.isBestSeller), ...rows.filter((row) => !row.isBestSeller)].slice(0, PREVIEW_ROWS)
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
  const [assets, setAssets] = useState<PublicOnboardingAssets>(view.assets)
  const [stepIndex, setStepIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(view.error)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const headingRef = useRef<HTMLDivElement>(null)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isReducedMotion = useReducedMotion()

  // Restore after mount (never during render: localStorage is browser-only).
  useEffect(() => {
    const restored = readSavedDraft(token, emptyDraft(view.businessName))
    setDraft(restored)
    setStepIndex(resumeIndex(token, restored, view.assets.menuImageUrls.length))
  }, [token, view.businessName, view.assets.menuImageUrls.length])

  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
  }, [])

  const step = WIZARD_STEPS[stepIndex]
  const isWelcome = step === 'welcome'
  const isLastStep = stepIndex === WIZARD_STEPS.length - 1
  const isAboutChapter = ABOUT_STEPS.has(step)
  const brand = resolveBrandColor(draft.brandColor, assets.logoColor, draft.storeType)
  const look = draft.storeType ? STORE_TYPES[draft.storeType].look : 'shop'
  const menuRead = useMenuRead(token, draft.menuText, assets.menuImageUrls, stepIndex > MENU_STEP_INDEX)

  function update(patch: Partial<WizardDraft>) {
    setDraft((current) => {
      const next = { ...current, ...patch }
      writeStorage(draftKey(token), JSON.stringify(next))
      return next
    })
    setError(null)
  }

  async function uploadPhoto(kind: 'logo' | 'menu', file: File): Promise<string | null> {
    const result = await uploadOnboardingPhoto(token, kind, file)
    if (!result.ok) return result.error
    setAssets(result.data)
    return null
  }

  async function removePhoto(kind: 'logo' | 'menu', index = 0): Promise<string | null> {
    const result = await removeOnboardingPhoto(token, kind, index)
    if (!result.ok) return result.error
    if (result.data) setAssets(result.data)
    return null
  }

  const previewProps: StorePreviewProps = {
    storeName: draft.storeName,
    tagline: '',
    storeType: draft.storeType,
    brand: brand ?? OB.ink,
    logoUrl: assets.logoUrl,
    rows: previewRows(menuRead, draft),
    look,
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
    // The draft holds wallet numbers and names; drop it once the server has the answers.
    writeStorage(draftKey(token), null)
    writeStorage(stepKey(token), null)
    // The login exists now: sign in, so the dashboard opens without a password prompt.
    await signInNewOwner(view.ownerEmail, password)
    onSubmitted(previewProps)
  }

  function goTo(nextIndex: number) {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    setDirection(nextIndex > stepIndex ? 1 : -1)
    setStepIndex(nextIndex)
    writeStorage(stepKey(token), WIZARD_STEPS[nextIndex])
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

  /** A one-tap answer moves on by itself, after the card has visibly lit up. */
  function advanceAfterAnswer() {
    if (!AUTO_ADVANCE_STEPS.has(step) || isLastStep) return
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    const target = stepIndex + 1
    advanceTimer.current = setTimeout(() => goTo(target), isReducedMotion ? 0 : AUTO_ADVANCE_MS)
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    next()
  }

  // The funnel: the first time this set-up reaches each screen (names only, never answers).
  useEffect(() => {
    trackOnboardingEvent(token, stepIndex === 0 ? 'opened' : `screen:${WIZARD_STEPS[stepIndex]}`)
  }, [token, stepIndex])

  // Move focus to the new question so screen readers announce it.
  useEffect(() => {
    if (stepIndex > 0) headingRef.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true })
  }, [stepIndex])

  const preview = <StorePreviewPhone {...previewProps} />
  const stepProps = { draft, update }
  const photoProps = { assets, uploadPhoto, removePhoto }
  const eyebrow = eyebrowFor(step)
  const storeName = draft.storeName.trim() || view.businessName
  const shift = isReducedMotion ? 0 : STEP_SHIFT_PX * direction
  const hasPreviewButton = PREVIEW_STEPS.has(step)

  const question = (
    <AnimatePresence mode="wait" initial={false} custom={direction}>
      <motion.div
        key={step}
        ref={headingRef}
        initial={{ opacity: 0, x: shift }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -shift }}
        transition={{ duration: 0.26, ease: STEP_EASE }}
        className="[&_h1]:outline-none"
      >
        {step === 'welcome' && <WelcomeStep firstName={view.ownerFirstName} businessName={view.businessName} isPaid={view.isPaymentConfirmed} />}
        {step === 'goals' && <GoalsStep {...stepProps} eyebrow={eyebrow} storeName={storeName} />}
        {step === 'channels' && <ChannelsStep {...stepProps} eyebrow={eyebrow} storeName={storeName} />}
        {step === 'daily' && <DailyOrdersStep {...stepProps} eyebrow={eyebrow} storeName={storeName} onAnswered={advanceAfterAnswer} />}
        {step === 'typical' && <TypicalOrderStep {...stepProps} eyebrow={eyebrow} storeName={storeName} onAnswered={advanceAfterAnswer} />}
        {step === 'plan' && <PlanStep draft={draft} storeName={storeName} />}
        {step === 'store' && <StoreStep {...stepProps} eyebrow={eyebrow} />}
        {step === 'brand' && <BrandStep {...stepProps} {...photoProps} brand={brand ?? OB.ink} eyebrow={eyebrow} />}
        {step === 'menu' && <MenuStep {...stepProps} {...photoProps} eyebrow={eyebrow} />}
        {step === 'ordering' && <OrderingStep {...stepProps} eyebrow={eyebrow} />}
        {step === 'payments' && <PaymentsStep {...stepProps} eyebrow={eyebrow} />}
        {step === 'hours' && <HoursStep {...stepProps} eyebrow={eyebrow} />}
        {step === 'bestsellers' && <BestSellersStep {...stepProps} eyebrow={eyebrow} read={menuRead} />}
        {step === 'account' && <AccountStep eyebrow={eyebrow} email={view.ownerEmail} password={password} setPassword={setPassword} />}
      </motion.div>
    </AnimatePresence>
  )

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      style={accentStyle(isAboutChapter ? null : brand, draft.storeType)}
      className={isAboutChapter ? '' : 'lg:grid lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'}
    >
      <div className={`min-w-0 px-5 pb-40 pt-4 sm:px-8 ${isAboutChapter ? '' : 'lg:flex lg:items-start lg:justify-center lg:px-12 lg:pb-36 lg:pt-8'}`}>
        <div className={`mx-auto w-full ${isAboutChapter ? 'max-w-[36rem]' : 'max-w-[34rem]'}`}>
          {!isWelcome && <div className="mb-8"><ChapterProgress step={step} /></div>}
          {isWelcome && <div className="h-6 sm:h-10" aria-hidden />}
          {question}
          {error && <div className="mt-6"><ErrorNote>{error}</ErrorNote></div>}
        </div>
      </div>

      {!isAboutChapter && (
        <aside className="hidden lg:block lg:p-4 lg:pb-28" aria-label="Preview of your store">
          <div className="sticky top-4 flex h-[calc(100dvh-9rem)] min-h-[560px] flex-col items-center justify-center rounded-3xl transition-colors duration-700" style={{ backgroundColor: ACCENT_SOFT }}>
            <div className="w-full max-w-[290px]">{preview}</div>
          </div>
        </aside>
      )}

      <footer className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 backdrop-blur" style={{ borderColor: OB.line }}>
        <div className="mx-auto flex h-[4.75rem] max-w-5xl items-center gap-3 px-5 sm:px-8">
          {stepIndex > 0 ? <TextButton onClick={() => goTo(stepIndex - 1)}>Back</TextButton> : <span />}
          <div className={`ml-auto flex items-center gap-2 ${isWelcome ? 'w-full sm:w-auto [&>button]:w-full sm:[&>button]:w-auto' : ''}`}>
            {hasPreviewButton && (
              <button type="button" onClick={() => setIsPreviewOpen(true)}
                className={`inline-flex min-h-12 items-center gap-2 rounded-xl border px-4 text-[15px] font-semibold lg:hidden ${FOCUS_RING}`}
                style={{ borderColor: OB.lineStrong, color: OB.ink }}>
                <Eye className="h-4 w-4" aria-hidden /> Preview
              </button>
            )}
            <PrimaryButton type="submit" isDisabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {continueLabel(step, isSubmitting)}
              {!isLastStep && !isSubmitting && <ArrowRight className="h-4 w-4" aria-hidden />}
            </PrimaryButton>
          </div>
        </div>
      </footer>

      <MobilePreviewSheet isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)}>{preview}</MobilePreviewSheet>
    </form>
  )
}
