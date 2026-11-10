'use client'

/**
 * The status block's other designs (Page Designer only): banner, card and
 * celebration. The first design, "Big tick", is ConfirmationHero itself.
 * Every design says the same thing as the standard hero — "Order Placed!" or
 * "Order Not Confirmed" with its message — and a failed order is never
 * crowned in the store's celebration colours: it gets the warning look.
 */

import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, PartyPopper } from 'lucide-react'

import { useConfirmationBlocks } from './confirmation-context'
import { ConfirmationHero, type HeroCopy } from './parts-status'

export type StatusDesign = 'centered' | 'banner' | 'card' | 'celebration'

interface StatusDesignProps {
  design: StatusDesign
  copy: HeroCopy
  showIcon: boolean
}

interface HeroWords {
  isFailed: boolean
  title: ReactNode
  subtitle: string
}

/** The hero's words, exactly as ConfirmationHero picks them. */
function useHeroWords(copy: HeroCopy): HeroWords | null {
  const b = useConfirmationBlocks()
  if (!b) return null
  const isFailed = b.hasOrderSaveFailed
  return {
    isFailed,
    title: isFailed ? copy.failedTitle ?? 'Order Not Confirmed' : copy.title ?? 'Order Placed!',
    subtitle: isFailed
      ? copy.failedSubtitle ?? `We could not reach ${b.storeName} with this order.`
      : copy.subtitle ?? `Your order has been sent to ${b.storeName}`,
  }
}

function BannerHero({ words, showIcon }: { words: HeroWords; showIcon: boolean }) {
  const { isFailed } = words
  // The band is the button colour, so --co-accent-text (readable on it) is its text.
  const band = isFailed
    ? 'bg-[var(--co-warning-soft)] border border-[color:var(--co-warning-border)] text-[color:var(--co-text)]'
    : 'bg-[var(--co-button)] text-[color:var(--co-accent-text)]'
  return (
    <div data-part="banner" className={`rounded-2xl px-6 py-8 text-center ${band}`}>
      {showIcon && (
        isFailed
          ? <AlertTriangle aria-hidden data-part="icon" className="mx-auto mb-3 h-12 w-12 text-[color:var(--co-warning)]" />
          : <CheckCircle2 aria-hidden data-part="icon" className="mx-auto mb-3 h-12 w-12 animate-[scale-in_0.4s_ease-out]" />
      )}
      <h1 data-part="title" className="mb-2 text-3xl font-bold">{words.title}</h1>
      <p data-part="subtitle" className={`text-lg ${isFailed ? 'text-[color:var(--co-muted)]' : 'opacity-90'}`}>{words.subtitle}</p>
    </div>
  )
}

function CardHero({ words, showIcon }: { words: HeroWords; showIcon: boolean }) {
  const { isFailed } = words
  return (
    <div
      data-branding-scope="checkout/card"
      data-part="card"
      className="flex items-start gap-4 rounded-2xl border border-[color:var(--co-border)] bg-[var(--co-card)] p-5 text-left shadow-sm"
    >
      {showIcon && (
        <div
          data-part="icon"
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
            isFailed ? 'bg-[var(--co-warning-soft)]' : 'bg-[var(--co-accent-soft)]'
          }`}
        >
          {isFailed
            ? <AlertTriangle aria-hidden className="h-7 w-7 text-[color:var(--co-warning)]" />
            : <CheckCircle2 aria-hidden className="h-7 w-7 text-[color:var(--co-accent)]" />}
        </div>
      )}
      <div className="min-w-0">
        <h1 data-part="title" className="mb-1 text-2xl font-bold text-[color:var(--co-text)]">{words.title}</h1>
        <p data-part="subtitle" className="text-base text-[color:var(--co-muted)]">{words.subtitle}</p>
      </div>
    </div>
  )
}

function CelebrationHero({ words, showIcon }: { words: HeroWords; showIcon: boolean }) {
  const { isFailed } = words
  const outer = isFailed ? 'bg-[var(--co-warning-soft)]' : 'bg-[var(--co-accent-softer)]'
  const inner = isFailed ? 'bg-[var(--co-warning-soft)]' : 'bg-[var(--co-accent-soft)]'
  return (
    <div className="py-8 text-center">
      {showIcon && (
        <div className={`mx-auto mb-6 flex h-40 w-40 items-center justify-center rounded-full ${outer}`}>
          <div data-part="icon" className={`flex h-28 w-28 items-center justify-center rounded-full ${inner}`}>
            {isFailed
              ? <AlertTriangle aria-hidden className="h-16 w-16 text-[color:var(--co-warning)]" />
              : <PartyPopper aria-hidden className="h-16 w-16 text-[color:var(--co-accent)] animate-[scale-in_0.4s_ease-out]" />}
          </div>
        </div>
      )}
      <h1 data-part="title" className="mb-3 text-4xl font-extrabold tracking-tight text-[color:var(--co-text)]">{words.title}</h1>
      <p data-part="subtitle" className="text-lg text-[color:var(--co-muted)]">{words.subtitle}</p>
    </div>
  )
}

/** The status hero in the block's design; "Big tick" is the standard hero, unchanged. */
export function StatusHero({ design, copy, showIcon }: StatusDesignProps) {
  const words = useHeroWords(copy)
  if (!words) return null
  switch (design) {
    case 'banner':
      return <BannerHero words={words} showIcon={showIcon} />
    case 'card':
      return <CardHero words={words} showIcon={showIcon} />
    case 'celebration':
      return <CelebrationHero words={words} showIcon={showIcon} />
    default:
      return <ConfirmationHero copy={copy} showIcon={showIcon} />
  }
}
