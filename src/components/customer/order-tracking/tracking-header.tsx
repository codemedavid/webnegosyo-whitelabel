'use client'

import Image from 'next/image'
import { ArrowLeft } from 'lucide-react'

interface TrackingHeaderProps {
  storeName: string
  logoUrl: string | null
  shortId: string
  isLive: boolean
  onBack: () => void
}

/** Sticky top bar: the store's identity, the order number, and the live pulse. */
export function TrackingHeader({ storeName, logoUrl, shortId, isLive, onBack }: TrackingHeaderProps) {
  return (
    <header
      className="sticky top-0 z-50 border-b backdrop-blur-md"
      style={{ backgroundColor: 'color-mix(in srgb, var(--trk-card) 88%, transparent)', borderColor: 'var(--trk-card-border)' }}
    >
      <div className="container mx-auto flex h-16 max-w-lg items-center gap-3 px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to menu"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/5"
          style={{ color: 'var(--trk-text)' }}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        {logoUrl ? (
          <Image
            src={logoUrl}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-full border object-cover"
            style={{ borderColor: 'var(--trk-card-border)' }}
            unoptimized
          />
        ) : (
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
            style={{ backgroundColor: 'var(--trk-accent)', color: 'var(--trk-on-accent)' }}
            aria-hidden="true"
          >
            {storeName.slice(0, 1).toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold leading-tight" style={{ color: 'var(--trk-text)' }}>
            {storeName}
          </h1>
          <p className="text-xs" style={{ color: 'var(--trk-text-muted)' }}>
            Order #{shortId}
          </p>
        </div>

        {isLive && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{ backgroundColor: 'var(--trk-accent-soft)', color: 'var(--trk-accent)' }}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 motion-reduce:animate-none" style={{ backgroundColor: 'var(--trk-accent)' }} />
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--trk-accent)' }} />
            </span>
            Live
          </span>
        )}
      </div>
    </header>
  )
}
