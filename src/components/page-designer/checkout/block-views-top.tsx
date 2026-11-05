'use client'

/**
 * The top of a designed checkout — the page header and the store-closed
 * notice — in each design the owner can pick. The first design of each is
 * the block exactly as it looked before designs existed.
 */

import { ArrowLeft, Clock, Sparkles } from 'lucide-react'
import type { ComponentType } from 'react'

import { cornersClass } from '@/lib/page-designer/knobs'
import { HEADER_DESIGNS, STORE_CLOSED_DESIGNS, type HeaderDesign, type StoreClosedDesign } from '@/lib/page-designer/checkout-block-options'

import { blockChoice, cornersOf, isOn } from './block-looks'
import { BlockColors, blockCheckout } from './block-theme'
import type { CheckoutBlockViewProps } from './block-views-details'

interface HeaderParts {
  title: string
  subtitle?: string
  /** null = the owner switched the back button off. */
  onBack: (() => void) | null
}

function BackButton({ onBack, className }: { onBack: () => void; className: string }) {
  return (
    <button type="button" onClick={onBack} aria-label="Back to cart" data-part="button-alt" className={className}>
      <ArrowLeft className="h-5 w-5" />
    </button>
  )
}

/** The standard header (unchanged markup). */
function StandardHeader({ title, subtitle, onBack }: HeaderParts) {
  return (
    // Senior mode has its own step bar with a back button.
    <header data-senior-hidden className="flex items-center gap-3 text-[color:var(--co-text)]">
      {onBack && (
        <BackButton
          onBack={onBack}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--co-subtle-strong)]"
        />
      )}
      <div className="min-w-0">
        <h1 data-part="title" className="text-2xl font-bold leading-tight text-[color:var(--co-text)]">{title}</h1>
        {subtitle && <p data-part="subtitle" className="text-sm text-[color:var(--co-muted)]">{subtitle}</p>}
      </div>
    </header>
  )
}

const ROUND_BACK =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--co-accent)]'

function CenteredHeader({ title, subtitle, onBack }: HeaderParts) {
  return (
    <header data-senior-hidden className="relative flex min-h-11 items-center justify-center px-12 text-center text-[color:var(--co-text)]">
      {onBack && <BackButton onBack={onBack} className={`absolute left-0 top-0 ${ROUND_BACK} hover:bg-[var(--co-subtle-strong)]`} />}
      <div className="min-w-0">
        <h1 data-part="title" className="text-2xl font-bold leading-tight text-[color:var(--co-text)]">{title}</h1>
        {subtitle && <p data-part="subtitle" className="text-sm text-[color:var(--co-muted)]">{subtitle}</p>}
      </div>
    </header>
  )
}

/** On the button colour, with its text colour: the pair the store already keeps readable. */
function BannerHeader({ title, subtitle, onBack }: HeaderParts) {
  return (
    <header
      data-senior-hidden
      data-part="banner"
      className="flex items-center gap-3 rounded-2xl bg-[var(--co-button)] px-4 py-4 text-[color:var(--co-accent-text)] shadow-sm sm:px-5 sm:py-5"
    >
      {onBack && <BackButton onBack={onBack} className={`${ROUND_BACK} bg-black/10 hover:bg-black/20`} />}
      <div className="min-w-0">
        <h1 data-part="title" className="text-2xl font-bold leading-tight">{title}</h1>
        {subtitle && <p data-part="subtitle" className="text-sm opacity-85">{subtitle}</p>}
      </div>
    </header>
  )
}

function CompactHeader({ title, subtitle, onBack }: HeaderParts) {
  return (
    <header data-senior-hidden className="flex items-center gap-2 text-[color:var(--co-text)]">
      {onBack && <BackButton onBack={onBack} className={`-ml-2 ${ROUND_BACK} hover:bg-[var(--co-subtle-strong)]`} />}
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <h1 data-part="title" className="text-lg font-bold leading-tight text-[color:var(--co-text)]">{title}</h1>
        {subtitle && <p data-part="subtitle" className="text-xs text-[color:var(--co-muted)]">{subtitle}</p>}
      </div>
    </header>
  )
}

const HEADERS: Record<HeaderDesign, ComponentType<HeaderParts>> = {
  standard: StandardHeader,
  centered: CenteredHeader,
  banner: BannerHeader,
  compact: CompactHeader,
}

export function HeaderView({ checkout, block }: CheckoutBlockViewProps) {
  const Header = HEADERS[blockChoice(block, 'variant', HEADER_DESIGNS)]
  const subtitle = isOn(block, 'show_subtitle') ? block.text('subtitle') : undefined
  const onBack = isOn(block, 'show_back') ? () => checkout.router.push(`/${checkout.tenantSlug}/cart`) : null
  const themed = blockCheckout(checkout, block)
  return (
    <BlockColors checkout={checkout} themed={themed}>
      <Header title={block.text('title')} subtitle={subtitle} onBack={onBack} />
    </BlockColors>
  )
}

const CLOSED_SURFACE: Record<StoreClosedDesign, string> = {
  soft: 'border border-[color:var(--co-warning-border)] bg-[var(--co-warning-soft)]',
  card: 'border border-[color:var(--co-border)] bg-[var(--co-card)] shadow-sm',
  outline: 'border-2 border-[color:var(--co-warning)] bg-[var(--co-card)]',
}

export function StoreClosedView({ checkout, block }: CheckoutBlockViewProps) {
  const status = checkout.openStatus
  if (!status?.isOrderingBlocked) return null
  const isPrelaunch = status.reason === 'prelaunch'
  const Icon = isPrelaunch ? Sparkles : Clock
  const design = blockChoice(block, 'variant', STORE_CLOSED_DESIGNS)
  const themed = blockCheckout(checkout, block)
  return (
    <BlockColors checkout={checkout} themed={themed}>
      <div
        role="status"
        data-part="card"
        className={`flex items-start gap-3 ${cornersClass(cornersOf(block), 'rounded-2xl')} ${CLOSED_SURFACE[design]} p-4 text-sm text-[color:var(--co-text)]`}
      >
        {design === 'card' ? (
          <span aria-hidden="true" data-part="icon" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--co-warning-soft)] text-[color:var(--co-warning)]">
            <Icon className="h-5 w-5" />
          </span>
        ) : (
          <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--co-warning)]" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p data-part="text" className="font-semibold">{isPrelaunch ? block.text('prelaunch') : block.text('closed')}</p>
          {isPrelaunch && <p data-part="muted" className="text-[color:var(--co-muted)]">{block.text('prelaunch_detail')}</p>}
          {!isPrelaunch && status.nextOpenLabel && <p data-part="muted" className="text-[color:var(--co-muted)]">Opens {status.nextOpenLabel}</p>}
        </div>
      </div>
    </BlockColors>
  )
}
