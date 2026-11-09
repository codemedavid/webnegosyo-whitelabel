'use client'

import Image from 'next/image'
import { ArrowLeft } from 'lucide-react'

export type TrackingHeaderLayout = 'standard' | 'centered' | 'compact'

interface TrackingHeaderProps {
  storeName: string
  logoUrl: string | null
  shortId: string
  isLive: boolean
  onBack: () => void
  /** The owner can hide the pulsing "Live" badge. */
  showLiveBadge?: boolean
  /** Page Designer wording; unset = today's "Order #07" / "Live". */
  orderLabel?: string
  liveLabel?: string
  /** Off in the Page Designer editor, where a sticky bar would ride over the canvas. */
  isSticky?: boolean
  /** Page Designer layout; unset = today's bar (logo and name on the left). */
  layout?: TrackingHeaderLayout
  /** Page Designer: hide the logo (or its initial). */
  showLogo?: boolean
  /** Page Designer: hide the store's name. */
  showStoreName?: boolean
  /** Page Designer: hide the "Order #07" line. */
  showOrderNumber?: boolean
}

/** Sticky top bar: the store's identity, the order number, and the live pulse. */
export function TrackingHeader({
  storeName,
  logoUrl,
  shortId,
  isLive,
  onBack,
  showLiveBadge = true,
  orderLabel,
  liveLabel,
  isSticky = true,
  layout = 'standard',
  showLogo = true,
  showStoreName = true,
  showOrderNumber = true,
}: TrackingHeaderProps) {
  const order = orderLabel ?? <>Order #{shortId}</>
  const badge = isLive && showLiveBadge ? <LiveBadge label={liveLabel ?? 'Live'} /> : null
  const logo = showLogo ? <StoreLogo storeName={storeName} logoUrl={logoUrl} isSmall={layout === 'compact'} /> : null

  return (
    <header
      data-branding-scope="tracking/header"
      data-part="banner"
      className={`${isSticky ? 'sticky top-0 z-50 ' : ''}border-b backdrop-blur-md`}
      style={{ backgroundColor: 'var(--trk-header-bg)', borderColor: 'var(--trk-card-border)' }}
    >
      {layout === 'centered' ? (
        <div className="container mx-auto grid h-16 max-w-lg grid-cols-[minmax(2.75rem,1fr)_minmax(0,auto)_minmax(2.75rem,1fr)] items-center gap-2 px-4">
          <BackButton onBack={onBack} size="h-11 w-11" />
          <div className="flex min-w-0 items-center justify-center gap-2">
            {logo}
            <div className="min-w-0 text-center">
              {showStoreName && (
                <h1 data-part="title" className="truncate text-base font-bold leading-tight" style={{ color: 'var(--trk-header-text)' }}>
                  {storeName}
                </h1>
              )}
              {showOrderNumber && <p data-part="subtitle" className="truncate text-xs" style={{ color: 'var(--trk-header-muted)' }}>{order}</p>}
            </div>
          </div>
          <div className="justify-self-end">{badge}</div>
        </div>
      ) : layout === 'compact' ? (
        <div className="container mx-auto flex h-12 max-w-lg items-center gap-2 px-3">
          <BackButton onBack={onBack} size="h-11 w-11" />
          {logo}
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            {showStoreName && (
              <h1 data-part="title" className="truncate text-sm font-bold" style={{ color: 'var(--trk-header-text)' }}>
                {storeName}
              </h1>
            )}
            {showOrderNumber && <p data-part="subtitle" className="shrink-0 text-xs" style={{ color: 'var(--trk-header-muted)' }}>{order}</p>}
          </div>
          {badge}
        </div>
      ) : (
        <div className="container mx-auto flex h-16 max-w-lg items-center gap-3 px-4">
          <BackButton onBack={onBack} size="h-10 w-10" />

          {logo}

          <div className="min-w-0 flex-1">
            {showStoreName && (
              <h1 data-part="title" className="truncate text-base font-bold leading-tight" style={{ color: 'var(--trk-header-text)' }}>
                {storeName}
              </h1>
            )}
            {showOrderNumber && (
              <p data-part="subtitle" className="text-xs" style={{ color: 'var(--trk-header-muted)' }}>
                {order}
              </p>
            )}
          </div>

          {badge}
        </div>
      )}
    </header>
  )
}

function BackButton({ onBack, size }: { onBack: () => void; size: string }) {
  return (
    <button
      type="button"
      onClick={onBack}
      aria-label="Back to menu"
      data-part="icon"
      className={`flex ${size} shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[color-mix(in_srgb,var(--trk-header-text)_8%,transparent)]`}
      style={{ color: 'var(--trk-header-text)' }}
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
  )
}

function StoreLogo({ storeName, logoUrl, isSmall }: { storeName: string; logoUrl: string | null; isSmall: boolean }) {
  const size = isSmall ? 'h-7 w-7' : 'h-9 w-9'
  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt=""
        width={isSmall ? 28 : 36}
        height={isSmall ? 28 : 36}
        className={`${size} shrink-0 rounded-full border object-cover`}
        style={{ borderColor: 'var(--trk-card-border)' }}
        unoptimized
      />
    )
  }
  return (
    <div
      className={`flex ${size} shrink-0 items-center justify-center rounded-full ${isSmall ? 'text-xs' : 'text-sm'} font-bold`}
      style={{ backgroundColor: 'var(--trk-accent)', color: 'var(--trk-on-accent)' }}
      aria-hidden="true"
    >
      {storeName.slice(0, 1).toUpperCase()}
    </div>
  )
}

function LiveBadge({ label }: { label: string }) {
  return (
    <span
      data-part="badge"
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: 'var(--trk-live-soft)', color: 'var(--trk-live)' }}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 motion-reduce:animate-none" style={{ backgroundColor: 'var(--trk-live)' }} />
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--trk-live)' }} />
      </span>
      {label}
    </span>
  )
}
