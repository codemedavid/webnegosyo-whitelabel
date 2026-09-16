'use client'
import Link from 'next/link'

import { useId, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Gift, PartyPopper, Phone, ShieldCheck, Sparkles, Stamp } from 'lucide-react'
import type { LoyaltyOffer } from '@/lib/loyalty/offer'
import type { ContactEarningSummary } from '@/lib/loyalty/contact-earning'
import type { OrderStampCard } from '@/lib/loyalty/stamp-status'
import type { StampCardView } from '@/lib/loyalty/stamp-card-view'
import { CLAIM_WINDOW_CLOSED_MESSAGE } from '@/lib/loyalty/claim-window'
import { formatPhMobileInput, toPhMobileE164 } from '@/lib/phone-display'
import { StampTrack } from '@/components/customer/order-tracking/stamp-track'
import { LoyaltyProgressPanel } from '@/components/customer/loyalty-progress-panel'
import { useLoyaltyProgress } from '@/hooks/use-loyalty-progress'

interface LoyaltyStampCardProps {
  orderId: string
  tenantId: string
  trackingToken: string
  /** Whether the order already shows a customer name (hides the name field). */
  hasName: boolean
  /** The store's live loyalty offer, or null when no stamp may be promised. */
  offer: LoyaltyOffer | null
  /** Whether the order is already settled — decides the "pending" wording. */
  isOrderComplete: boolean
  storeName: string
  tenantSlug?: string
  /** The store's logo, stamped into every earned slot. Null falls back to a check. */
  logoUrl?: string | null
  /**
   * Which face to show, from `decideStampCardView`. Defaults to the claim form
   * so the card is usable on its own.
   */
  view?: Exclude<StampCardView, 'hidden'>
  /** The saved number's live progress, including before this order earns. */
  card?: OrderStampCard | null
  /** Called after a successful claim so the page can re-read the live card. */
  onClaimed?: () => void
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; loyalty: ContactEarningSummary }
  | { kind: 'already_set' }
  | { kind: 'claim_closed' }
  | { kind: 'error' }

const NAME_MAX = 64

/**
 * The receipt-QR phone capture, dressed as the store's loyalty card.
 *
 * One submit, because the server accepts exactly one (the QR is on paper).
 * Everything the card promises comes from `offer` and everything it
 * celebrates comes from the API's summary — the card never invents a stamp.
 */
export function LoyaltyStampCard({
  orderId,
  tenantId,
  trackingToken,
  hasName,
  offer,
  isOrderComplete,
  storeName,
  tenantSlug,
  logoUrl = null,
  view = 'claim',
  card = null,
  onClaimed,
}: LoyaltyStampCardProps) {
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const phoneId = useId()
  const nameId = useId()

  const e164 = toPhMobileE164(phone)
  const isSaving = phase.kind === 'saving'
  const canSubmit = e164 !== null && !isSaving

  // The card the typed number ALREADY holds. A customer scanning a receipt
  // wants to see their six stamps before they claim the seventh, and until the
  // number is on the order there is no token-authorized read that can show it.
  const typedProgress = useLoyaltyProgress({
    tenantId,
    phone: e164,
    enabled: offer !== null && (phase.kind === 'idle' || phase.kind === 'error'),
  })

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!e164 || isSaving) return

    setPhase({ kind: 'saving' })
    try {
      const res = await fetch('/api/orders/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          tenantId,
          token: trackingToken,
          contact: e164,
          ...(name.trim() ? { name: name.trim().slice(0, NAME_MAX) } : {}),
        }),
      })
      if (res.ok) {
        const body = (await res.json().catch(() => null)) as { loyalty?: ContactEarningSummary } | null
        setPhase({ kind: 'saved', loyalty: body?.loyalty ?? { state: 'attached' } })
        onClaimed?.()
      } else if (res.status === 409) {
        setPhase({ kind: 'already_set' })
        onClaimed?.()
      } else if (res.status === 410) {
        // The order finished between loading the page and pressing the button.
        setPhase({ kind: 'claim_closed' })
      } else {
        setPhase({ kind: 'error' })
      }
    } catch {
      setPhase({ kind: 'error' })
    }
  }

  if (view === 'card' && card) {
    return (
      <CardShell>
        <EarnedCardState card={card} storeName={storeName} logoUrl={logoUrl} />
        {tenantSlug ? <Link href={`/${tenantSlug}/loyalty`} className="block px-5 pb-5 text-sm font-semibold underline" style={{ color: 'var(--trk-accent)' }}>View rewards & claim</Link> : null}
      </CardShell>
    )
  }

  if (phase.kind === 'saved') {
    return (
      <CardShell>
        <SavedState
          loyalty={phase.loyalty}
          offer={offer}
          isOrderComplete={isOrderComplete}
          storeName={storeName}
          logoUrl={logoUrl}
        />
        {tenantSlug ? <Link href={`/${tenantSlug}/loyalty`} className="block px-5 pb-5 text-sm font-semibold underline" style={{ color: 'var(--trk-accent)' }}>View rewards & claim</Link> : null}
      </CardShell>
    )
  }

  if (phase.kind === 'claim_closed' || (phase.kind === 'idle' && view === 'closed')) {
    return (
      <CardShell>
        <ClosedState offer={offer} storeName={storeName} />
      </CardShell>
    )
  }

  if (phase.kind === 'idle' && view === 'awaiting') {
    return (
      <CardShell>
        <AwaitingState offer={offer} storeName={storeName} isOrderComplete={isOrderComplete} logoUrl={logoUrl} />
      </CardShell>
    )
  }

  if (phase.kind === 'already_set') {
    return (
      <CardShell>
        <div className="p-5 text-center">
          <p className="text-sm font-semibold" style={{ color: 'var(--trk-text)' }}>
            This order already has a number on it.
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--trk-text-muted)' }}>
            Your stamps are safe on the number you gave at the counter.
          </p>
        </div>
      </CardShell>
    )
  }

  return (
    <CardShell>
      <OfferHeader offer={offer} storeName={storeName} />

      <form onSubmit={handleSubmit} className="space-y-3 p-5">
        {typedProgress.card ? (
          <LoyaltyProgressPanel
            tenantSlug={tenantSlug}
            offer={typedProgress.offer}
            card={typedProgress.card}
            isLoading={false}
            storeName={storeName}
            logoUrl={logoUrl}
          />
        ) : (
          <>
            {/* The store's promise, until the typed number replaces it with
                the customer's own card. The row stays put while the lookup
                runs — a track that blinks out mid-type reads as a fault. */}
            {offer && (
              <StampTrack threshold={offer.threshold} filled={0} nextIsLive earnMode={offer.earnMode} logoUrl={logoUrl} />
            )}
            {typedProgress.isLoading && (
              <LoyaltyProgressPanel offer={null} card={null} isLoading storeName={storeName} />
            )}
          </>
        )}

        <div className="space-y-1.5">
          <label htmlFor={phoneId} className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--trk-text-muted)' }}>
            Mobile number
          </label>
          <div
            className="flex items-center gap-2 rounded-2xl border-2 bg-white px-3 transition-colors focus-within:border-[var(--trk-accent)]"
            style={{ borderColor: e164 ? 'var(--trk-accent)' : 'var(--trk-card-border)' }}
          >
            <span className="select-none text-lg" aria-hidden="true">🇵🇭</span>
            <input
              id={phoneId}
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="0917 123 4567"
              value={phone}
              onChange={(e) => setPhone(formatPhMobileInput(e.target.value))}
              maxLength={17}
              required
              className="h-14 w-full bg-transparent text-xl font-semibold tracking-wide outline-none placeholder:font-normal placeholder:text-gray-300"
              style={{ color: 'var(--trk-text)' }}
            />
            {e164 && (
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-lg"
                aria-label="Number looks good"
              >
                ✅
              </motion.span>
            )}
          </div>
        </div>

        {!hasName && (
          <div className="space-y-1.5">
            <label htmlFor={nameId} className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--trk-text-muted)' }}>
              Your name <span className="font-normal normal-case">(optional)</span>
            </label>
            <input
              id={nameId}
              type="text"
              placeholder="So we can greet you next time"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={NAME_MAX}
              className="h-12 w-full rounded-2xl border-2 bg-white px-4 text-base outline-none focus:border-[var(--trk-accent)]"
              style={{ borderColor: 'var(--trk-card-border)', color: 'var(--trk-text)' }}
            />
          </div>
        )}

        {phase.kind === 'error' && (
          <p role="alert" className="text-xs font-medium" style={{ color: 'var(--trk-error)' }}>
            We couldn&apos;t save that right now. Please try again.
          </p>
        )}

        <motion.button
          type="submit"
          disabled={!canSubmit}
          whileTap={canSubmit ? { scale: 0.97 } : undefined}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-full text-base font-bold shadow-lg transition-opacity disabled:opacity-40 disabled:shadow-none"
          style={{ backgroundColor: 'var(--trk-cta)', color: 'var(--trk-on-cta)' }}
        >
          {isSaving ? (
            'Saving…'
          ) : offer ? (
            <>
              <Stamp className="h-5 w-5" aria-hidden="true" />
              Claim my stamp
            </>
          ) : (
            <>
              <Phone className="h-5 w-5" aria-hidden="true" />
              Save my number
            </>
          )}
        </motion.button>

        <p className="flex items-center justify-center gap-1.5 text-[11px]" style={{ color: 'var(--trk-text-faint)' }}>
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Only used for your rewards and order updates. No spam.
        </p>
      </form>
    </CardShell>
  )
}

/**
 * The customer's live card for this order: the balance the ledger holds right
 * now, so a refresh hours after the claim shows the same stamps.
 */
function EarnedCardState({
  card,
  storeName,
  logoUrl,
}: {
  card: OrderStampCard
  storeName: string
  logoUrl: string | null
}) {
  const unit = card.earnMode === 'stamp' ? 'stamps' : 'points'
  const hasReward = card.rewardsAvailable > 0
  const filled = card.balance === 0 && hasReward ? card.threshold : card.balance

  return (
    <div data-testid="stamp-card-earned">
      <div
        className="px-5 pb-4 pt-5 text-center"
        style={{ background: 'linear-gradient(135deg, var(--trk-accent), var(--trk-accent-strong))', color: 'var(--trk-on-accent)' }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">{card.programName}</p>
        <h2 className="mt-1 text-2xl font-extrabold leading-tight">
          {hasReward ? 'Reward ready!' : card.earnedOnOrder === false ? 'Your reward progress' : 'Stamp collected!'}
        </h2>
        <p className="mt-1.5 text-sm opacity-90">
          {hasReward
            ? `${card.rewardLabel} is waiting. Give your number at ${storeName} to use it.`
            : `${card.balance} of ${card.threshold} ${unit} toward ${card.rewardLabel}`}
        </p>
      </div>
      <div className="p-5">
        <StampTrack threshold={card.threshold} filled={filled} earnMode={card.earnMode} logoUrl={logoUrl} />
        <p className="mt-3 text-center text-xs" style={{ color: 'var(--trk-text-muted)' }}>
          Use the same number when you order and your stamps add up automatically.
        </p>
      </div>
    </div>
  )
}

/** The number is on the order; the stamp lands when the order is completed. */
function AwaitingState({
  offer,
  storeName,
  isOrderComplete,
  logoUrl,
}: {
  offer: LoyaltyOffer | null
  storeName: string
  isOrderComplete: boolean
  logoUrl: string | null
}) {
  return (
    <div data-testid="stamp-card-awaiting" className="p-5 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--trk-accent-soft)', color: 'var(--trk-accent)' }}>
        <Stamp className="h-7 w-7" aria-hidden="true" />
      </div>
      <h2 className="mt-3 text-xl font-extrabold" style={{ color: 'var(--trk-text)' }}>
        Your stamp is on the way
      </h2>
      <p className="mt-1 text-sm" style={{ color: 'var(--trk-text-muted)' }}>
        {isOrderComplete
          ? `${storeName} has your number — your stamp lands once this order is settled.`
          : 'It lands as soon as your order is completed. Come back to this page any time.'}
      </p>
      {offer && (
        <div className="mt-4">
          <StampTrack threshold={offer.threshold} filled={0} nextIsLive earnMode={offer.earnMode} logoUrl={logoUrl} />
        </div>
      )}
    </div>
  )
}

/**
 * The window is over. Said plainly, and without hinting that an earlier scan
 * would have worked — the rule exists so a found receipt claims nothing.
 */
function ClosedState({ offer, storeName }: { offer: LoyaltyOffer | null; storeName: string }) {
  return (
    <div data-testid="stamp-card-closed" className="p-5 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--trk-card-border)', color: 'var(--trk-text-muted)' }}>
        <Stamp className="h-7 w-7" aria-hidden="true" />
      </div>
      <h2 className="mt-3 text-xl font-extrabold" style={{ color: 'var(--trk-text)' }}>
        Stamp claiming is closed
      </h2>
      <p className="mt-1 text-sm" style={{ color: 'var(--trk-text-muted)' }}>
        {CLAIM_WINDOW_CLOSED_MESSAGE}
      </p>
      {offer && (
        <p className="mt-3 text-xs" style={{ color: 'var(--trk-text-faint)' }}>
          {offer.earnMode === 'stamp'
            ? `${offer.threshold} stamps = ${offer.rewardLabel} at ${storeName}.`
            : `${offer.threshold} points = ${offer.rewardLabel} at ${storeName}.`}
        </p>
      )}
    </div>
  )
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <section
      data-testid="loyalty-stamp-card"
      aria-label="Loyalty"
      className="overflow-hidden rounded-3xl border shadow-sm"
      style={{ backgroundColor: 'var(--trk-card)', borderColor: 'var(--trk-card-border)' }}
    >
      {children}
    </section>
  )
}

function OfferHeader({ offer, storeName }: { offer: LoyaltyOffer | null; storeName: string }) {
  return (
    <div
      className="relative overflow-hidden px-5 pb-4 pt-5"
      style={{ background: 'linear-gradient(135deg, var(--trk-accent), var(--trk-accent-strong))', color: 'var(--trk-on-accent)' }}
    >
      <Sparkles className="absolute -right-3 -top-3 h-20 w-20 opacity-15" aria-hidden="true" />
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">
        {offer ? offer.programName : storeName}
      </p>
      {offer ? (
        <>
          <h2 className="mt-1 text-2xl font-extrabold leading-tight">Claim your stamp for this order</h2>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm opacity-90">
            <Gift className="h-4 w-4 shrink-0" aria-hidden="true" />
            {offer.earnMode === 'stamp'
              ? `${offer.threshold} stamps = ${offer.rewardLabel}`
              : `${offer.threshold} points = ${offer.rewardLabel}`}
          </p>
        </>
      ) : (
        <>
          <h2 className="mt-1 text-2xl font-extrabold leading-tight">Add your number to this order</h2>
          <p className="mt-1.5 text-sm opacity-90">So {storeName} can text you if anything comes up.</p>
        </>
      )}
    </div>
  )
}

interface SavedStateProps {
  loyalty: ContactEarningSummary
  offer: LoyaltyOffer | null
  isOrderComplete: boolean
  storeName: string
  logoUrl: string | null
}

function SavedState({ loyalty, offer, isOrderComplete, storeName, logoUrl }: SavedStateProps) {
  const reduceMotion = useReducedMotion()

  if (loyalty.state === 'earned' && offer) {
    const filled = loyalty.rewardUnlocked && loyalty.balance === 0 ? offer.threshold : (loyalty.balance ?? 1)
    const unit = offer.earnMode === 'stamp' ? 'stamps' : 'points'
    return (
      <div role="status" aria-live="polite">
        <div
          className="relative overflow-hidden px-5 pb-4 pt-5 text-center"
          style={{ background: 'linear-gradient(135deg, var(--trk-accent), var(--trk-accent-strong))', color: 'var(--trk-on-accent)' }}
        >
          <Confetti disabled={Boolean(reduceMotion)} />
          <motion.div
            initial={reduceMotion ? false : { scale: 0.4, rotate: -20, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 14 }}
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/20"
          >
            {loyalty.rewardUnlocked ? <PartyPopper className="h-8 w-8" aria-hidden="true" /> : <Stamp className="h-8 w-8" aria-hidden="true" />}
          </motion.div>
          <h2 className="mt-3 text-2xl font-extrabold leading-tight">
            {loyalty.rewardUnlocked ? 'Reward unlocked!' : 'Stamp collected!'}
          </h2>
          <p className="mt-1 text-sm opacity-90">
            {loyalty.rewardUnlocked
              ? `${offer.rewardLabel} is yours. Show this number at ${storeName} to claim it.`
              : loyalty.balance !== null
                ? `${loyalty.balance} of ${offer.threshold} ${unit} toward ${offer.rewardLabel}`
                : `Your stamp is on your card at ${storeName}.`}
          </p>
        </div>
        <div className="p-5">
          <StampTrack threshold={offer.threshold} filled={filled} earnMode={offer.earnMode} animateLast logoUrl={logoUrl} />
          <p className="mt-3 text-center text-xs" style={{ color: 'var(--trk-text-muted)' }}>
            Use the same number when you order and your stamps add up automatically.
          </p>
        </div>
      </div>
    )
  }

  if (loyalty.state === 'pending' && offer) {
    return (
      <div role="status" aria-live="polite" className="p-5 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--trk-accent-soft)', color: 'var(--trk-accent)' }}>
          <Stamp className="h-7 w-7" aria-hidden="true" />
        </div>
        <h2 className="mt-3 text-xl font-extrabold" style={{ color: 'var(--trk-text)' }}>
          Number saved!
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--trk-text-muted)' }}>
          {isOrderComplete
            ? `Stamps count on qualifying orders from now on at ${storeName}.`
            : 'Your stamp lands when your order is completed. Keep this page open or come back later.'}
        </p>
        <div className="mt-4">
          <StampTrack threshold={offer.threshold} filled={0} nextIsLive earnMode={offer.earnMode} logoUrl={logoUrl} />
        </div>
      </div>
    )
  }

  return (
    <div role="status" aria-live="polite" className="p-5 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--trk-success-soft)', color: 'var(--trk-success)' }}>
        <ShieldCheck className="h-7 w-7" aria-hidden="true" />
      </div>
      <h2 className="mt-3 text-xl font-extrabold" style={{ color: 'var(--trk-text)' }}>
        Thanks! Your number is on this order.
      </h2>
      <p className="mt-1 text-sm" style={{ color: 'var(--trk-text-muted)' }}>
        {storeName} can reach you if anything comes up.
      </p>
    </div>
  )
}

const CONFETTI_PIECES = 14

/** A short burst of brand-tinted confetti; a static sparkle when motion is reduced. */
function Confetti({ disabled }: { disabled: boolean }) {
  if (disabled) return null
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {Array.from({ length: CONFETTI_PIECES }, (_, i) => {
        const left = 6 + ((i * 37) % 88)
        const delay = (i % 5) * 0.06
        const size = 6 + (i % 3) * 3
        return (
          <motion.span
            key={i}
            initial={{ y: -20, x: 0, opacity: 0, rotate: 0 }}
            animate={{ y: 140, x: (i % 2 === 0 ? 1 : -1) * (10 + (i % 4) * 8), opacity: [0, 1, 1, 0], rotate: 360 }}
            transition={{ duration: 1.4 + (i % 3) * 0.2, delay, ease: 'easeOut' }}
            className="absolute top-0 block rounded-sm bg-white"
            style={{ left: `${left}%`, width: size, height: size, opacity: 0.85 }}
          />
        )
      })}
    </div>
  )
}
