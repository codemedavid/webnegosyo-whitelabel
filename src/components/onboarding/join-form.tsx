'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Check, Loader2, Pencil } from 'lucide-react'
import { redeemSignupLinkAction } from '@/app/actions/signup-link'
import { ErrorNote, FOCUS_RING, INPUT_CLASS, OB, PrimaryButton } from './onboarding-ui'
import { EMPTY_JOIN, JOIN_QUESTIONS, joinFieldError, previewStoreLink, type JoinFields } from './join-steps'

const EASE = [0.16, 1, 0.3, 1] as const
const SHIFT_PX = 32

/** Their future link, written as they type: the dream, before a single setting. */
function LinkPreview({ businessName, rootDomain }: { businessName: string; rootDomain: string }) {
  const isReducedMotion = useReducedMotion()
  const link = previewStoreLink(businessName, rootDomain)
  const hasName = businessName.trim().length > 0
  return (
    <div className="rounded-3xl p-5 text-white shadow-[0_20px_50px_-20px_rgba(23,19,15,0.6)]" style={{ background: 'linear-gradient(135deg, #17130F 0%, #3A2E24 100%)' }}>
      <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-white/60">{hasName ? 'Your store link' : 'Your store, online today'}</p>
      <p className="mt-2 font-mono text-[17px] font-bold leading-snug [overflow-wrap:anywhere] sm:text-[19px]">
        <span className="sr-only">{link}</span>
        <span className="hidden text-white/50 sm:inline" aria-hidden>https://</span>
        {link.split('').map((char, index) => (
          <motion.span
            aria-hidden
            key={`${index}-${char}`}
            initial={isReducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
          >
            {char}
          </motion.span>
        ))}
        <span className="ml-0.5 inline-block h-5 w-[2px] translate-y-1 animate-pulse bg-[#E8B23A] motion-reduce:animate-none" aria-hidden />
      </p>
      <AnimatePresence>
        {hasName && (
          <motion.div
            initial={isReducedMotion ? false : { opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.35, duration: 0.4, ease: EASE }}
            className="mt-4 flex items-center gap-3 rounded-2xl bg-white/10 px-3.5 py-2.5 backdrop-blur"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E8B23A] text-[13px] font-extrabold text-[#17130F]" aria-hidden>₱</span>
            <span className="min-w-0 text-[13px] leading-snug">
              <b className="block truncate">New order at {businessName.trim()}</b>
              <span className="text-white/70">2× Chicken Inasal · ₱245</span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
      {hasName && <p className="mt-3 text-[12px] text-white/50">If the name is taken, we add a number.</p>}
    </div>
  )
}

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

/** The sign-up link: one question a screen, with their store link writing itself above. */
export function JoinForm({ code, rootDomain = '' }: { code: string; rootDomain?: string }) {
  const [form, setForm] = useState<JoinFields>(EMPTY_JOIN)
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const isReducedMotion = useReducedMotion()
  const question = JOIN_QUESTIONS[index]
  const isLast = index === JOIN_QUESTIONS.length - 1
  const isValid = joinFieldError(question.key, form[question.key]) === null
  const shift = isReducedMotion ? 0 : SHIFT_PX * direction

  useEffect(() => {
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
    <form onSubmit={handleSubmit} noValidate className="mx-auto max-w-md space-y-7 px-5 pb-16 pt-6 sm:pt-12">
      <LinkPreview businessName={form.business_name} rootDomain={rootDomain} />

      <div className="flex gap-1.5" role="progressbar" aria-label="Sign-up progress" aria-valuemin={1} aria-valuemax={JOIN_QUESTIONS.length} aria-valuenow={index + 1}>
        {JOIN_QUESTIONS.map((item, itemIndex) => (
          <span key={item.key} className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: OB.line }}>
            <motion.span className="block h-full rounded-full" style={{ backgroundColor: OB.ink }}
              initial={false} animate={{ width: itemIndex <= index ? '100%' : '0%' }} transition={{ duration: 0.45, ease: EASE }} />
          </span>
        ))}
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
          transition={{ duration: 0.28, ease: EASE }}
        >
          <p className="text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: OB.faint }}>{index + 1} of {JOIN_QUESTIONS.length}</p>
          <label htmlFor={`join-${question.key}`} className="mt-1.5 block text-balance text-[1.75rem] font-extrabold leading-[1.1] tracking-[-0.025em] sm:text-[2rem]" style={{ color: OB.ink }}>
            {question.title}
          </label>
          <p className="mt-2 text-base leading-relaxed" style={{ color: OB.muted }}>{question.lede}</p>
          <div className="relative mt-5">
            <input
              id={`join-${question.key}`}
              ref={inputRef}
              type={question.type}
              inputMode={question.inputMode}
              required
              autoComplete={question.autoComplete}
              placeholder={question.placeholder}
              className={`${INPUT_CLASS} !py-4 pr-12 text-lg font-semibold`}
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
                  className="absolute right-3.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-600 text-white"
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
      <p className="text-center text-[13px] leading-relaxed" style={{ color: OB.muted }}>This link works once and is just for you.</p>
    </form>
  )
}
