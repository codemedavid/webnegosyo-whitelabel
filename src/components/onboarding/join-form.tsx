'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Check, Loader2, Pencil } from 'lucide-react'
import { redeemSignupLinkAction } from '@/app/actions/signup-link'
import { Owl, type OwlState } from '@/components/mascot/owl'
import { ErrorNote, FOCUS_RING, INPUT_CLASS, OB, PrimaryButton } from './onboarding-ui'
import { EMPTY_JOIN, JOIN_QUESTIONS, joinFieldError, questionIndexFor, type JoinFields } from './join-steps'
import { JoinStoreCard } from './join-store-card'
import { EASE_OUT } from './motion/parts'

/*
 * The sign-up link: a night-time hero where their store opens under their own
 * name and link, and a white sheet that asks one thing at a time. The action
 * wears SmartMenu red (the brand of the link they were sent).
 */

const SHIFT_PX = 32
const AMBER = '#F5A623'
const BRAND_ACCENT = { '--ob-accent': '#D7261D', '--ob-accent-ink': '#FFFFFF', '--ob-accent-soft': '#FFF6F3' } as React.CSSProperties

/** A finished answer, shrunk to a chip you can tap to change. */
function AnswerChip({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <motion.button
      layout
      type="button"
      onClick={onEdit}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`inline-flex min-h-10 max-w-full items-center gap-2 rounded-full border-2 bg-white py-1 pl-1.5 pr-3 text-[13.5px] font-semibold ${FOCUS_RING}`}
      style={{ borderColor: OB.line, color: OB.ink }}
      aria-label={`Change ${label}: ${value}`}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white" aria-hidden><Check className="h-3.5 w-3.5" strokeWidth={3.5} /></span>
      <span className="truncate">{value}</span>
      <Pencil className="h-3 w-3 shrink-0" style={{ color: OB.faint }} aria-hidden />
    </motion.button>
  )
}

function Hero({ businessName, rootDomain }: { businessName: string; rootDomain: string }) {
  const name = businessName.trim()
  return (
    <section className="px-5 pb-12 pt-2 sm:px-8 lg:flex lg:items-center lg:justify-center lg:px-12 lg:pb-16">
      <div className="mx-auto w-full max-w-md lg:max-w-[34rem]">
        <p className="text-[12px] font-bold uppercase tracking-[0.14em]" style={{ color: AMBER }}>Your store, online today</p>
        <h1 className="mt-2 text-balance text-[2.4rem] font-extrabold leading-[1.02] tracking-[-0.01em] sm:text-[3.25rem]" style={{ fontFamily: 'var(--font-landing-display), system-ui' }}>
          Let&apos;s open{' '}
          <span className="relative inline-block" style={{ color: name ? AMBER : '#FFFFFF' }}>
            {name || 'your store'}
            <motion.span className="absolute inset-x-0 -bottom-0.5 h-[0.1em] origin-left rounded-full" style={{ backgroundColor: AMBER }}
              initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.3, duration: 0.6, ease: EASE_OUT }} aria-hidden />
          </span>
        </h1>
        <div className="mt-6">
          <JoinStoreCard businessName={businessName} rootDomain={rootDomain} />
        </div>
      </div>
    </section>
  )
}

function owlFor(isSaving: boolean, hasError: boolean, isValid: boolean): OwlState {
  if (isSaving) return 'thinking'
  if (hasError) return 'sorry'
  return isValid ? 'happy' : 'idle'
}

/** The sign-up link: one question a screen, with their store opening above it. */
export function JoinForm({ code, rootDomain = '' }: { code: string; rootDomain?: string }) {
  const [form, setForm] = useState<JoinFields>(EMPTY_JOIN)
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const hasMounted = useRef(false)
  const isReducedMotion = useReducedMotion()
  const question = JOIN_QUESTIONS[index]
  const isLast = index === JOIN_QUESTIONS.length - 1
  const isValid = joinFieldError(question.key, form[question.key]) === null
  const shift = isReducedMotion ? 0 : SHIFT_PX * direction

  // Focus the new question, but not on arrival: the keyboard would cover the store on a phone.
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true
      return
    }
    inputRef.current?.focus({ preventScroll: true })
  }, [index])

  function goTo(next: number) {
    setDirection(next > index ? 1 : -1)
    setIndex(next)
    setError(null)
  }

  async function redeem() {
    setIsSaving(true)
    setError(null)
    try {
      const result = await redeemSignupLinkAction(code, form)
      if (result.error !== null) {
        // A refusal about one answer (a taken email) reopens that question, with the reason under it.
        const target = questionIndexFor(result.field)
        if (target >= 0 && target !== index) goTo(target)
        setError(result.error)
        setIsSaving(false)
        return
      }
      // Full navigation: the wizard page is rendered per request on the server.
      window.location.assign(result.path)
    } catch (submitError) {
      console.error('[signup-link] submit failed', submitError)
      setError('Something went wrong. Check your connection and try again.')
      setIsSaving(false)
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const fieldError = joinFieldError(question.key, form[question.key])
    if (fieldError) return setError(fieldError)
    // Every answer is re-checked before the one server call, in case one was edited back to blank.
    const firstBad = JOIN_QUESTIONS.findIndex((item) => joinFieldError(item.key, form[item.key]) !== null)
    if (firstBad >= 0 && firstBad !== index) return goTo(firstBad)
    if (isLast || firstBad < 0) return void redeem()
    goTo(index + 1)
  }

  const answered = JOIN_QUESTIONS.filter((item, itemIndex) => itemIndex !== index && joinFieldError(item.key, form[item.key]) === null)

  return (
    <form onSubmit={handleSubmit} noValidate style={BRAND_ACCENT} className="lg:grid lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-2">
      <Hero businessName={form.business_name} rootDomain={rootDomain} />

      <section className="relative -mt-6 min-h-[60dvh] rounded-t-[2rem] bg-white px-5 pb-12 pt-9 text-[#17130F] sm:px-8 lg:mt-0 lg:flex lg:min-h-0 lg:items-center lg:justify-center lg:rounded-none lg:px-12">
        <div className="pointer-events-none absolute -top-[4.6rem] right-5 sm:right-8 lg:hidden">
          <Owl state={owlFor(isSaving, error !== null, isValid)} size={78} />
        </div>
        <div className="mx-auto w-full max-w-md space-y-6">
          <div className="hidden lg:block"><Owl state={owlFor(isSaving, error !== null, isValid)} size={110} /></div>
          <div className="flex items-center gap-3">
            <div className="flex flex-1 gap-1.5" role="progressbar" aria-label="Sign-up progress" aria-valuemin={1} aria-valuemax={JOIN_QUESTIONS.length} aria-valuenow={index + 1}>
              {JOIN_QUESTIONS.map((item, itemIndex) => (
                <span key={item.key} className="h-2 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: OB.line }}>
                  <motion.span className="block h-full rounded-full" style={{ backgroundColor: 'var(--ob-accent)' }}
                    initial={false} animate={{ width: itemIndex <= index ? '100%' : '0%' }} transition={{ duration: 0.45, ease: EASE_OUT }} />
                </span>
              ))}
            </div>
            <span className="shrink-0 text-[12px] font-bold tabular-nums" style={{ color: OB.faint }}>{index + 1} / {JOIN_QUESTIONS.length}</span>
          </div>

          {answered.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {answered.map((item) => (
                <AnswerChip key={item.key} label={item.title} value={form[item.key].trim()} onEdit={() => goTo(JOIN_QUESTIONS.indexOf(item))} />
              ))}
            </div>
          )}

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={question.key}
              initial={{ opacity: 0, x: shift }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -shift }}
              transition={{ duration: 0.28, ease: EASE_OUT }}
            >
              <label htmlFor={`join-${question.key}`} className="block text-balance text-[1.75rem] font-extrabold leading-[1.08] tracking-[-0.01em] sm:text-[2rem]" style={{ fontFamily: 'var(--font-landing-display), system-ui' }}>
                {question.title}
              </label>
              <p className="mt-1.5 text-[15px] leading-relaxed" style={{ color: OB.muted }}>{question.lede}</p>
              <div className="relative mt-5">
                <input
                  id={`join-${question.key}`}
                  ref={inputRef}
                  type={question.type}
                  inputMode={question.inputMode}
                  required
                  autoComplete={question.autoComplete}
                  placeholder={question.placeholder}
                  className={`${INPUT_CLASS} !rounded-2xl !border-2 !py-4 pr-14 text-lg font-semibold`}
                  value={form[question.key]}
                  aria-invalid={error !== null}
                  onChange={(event) => {
                    setForm({ ...form, [question.key]: event.target.value })
                    setError(null)
                  }}
                />
                <AnimatePresence>
                  {isValid && (
                    <motion.span
                      initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                      className="absolute right-3.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-600 text-white"
                      aria-hidden
                    >
                      <Check className="h-4 w-4" strokeWidth={3.5} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </AnimatePresence>

          {error && <ErrorNote>{error}</ErrorNote>}

          <PrimaryButton type="submit" isDisabled={isSaving} isFull>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {isSaving ? 'Opening your set-up…' : isLast ? 'Start building my store' : 'Next'}
            {!isSaving && <ArrowRight className="h-4 w-4" aria-hidden />}
          </PrimaryButton>
          <p className="text-center text-[13px] leading-relaxed" style={{ color: OB.muted }}>About 5 minutes in all. This link works once and is just for you.</p>
        </div>
      </section>
    </form>
  )
}
