'use client'

import type { CSSProperties } from 'react'
import { ArrowLeft } from 'lucide-react'
import { StoreLabel } from '@/components/customer/storefront-labels-provider'

export type BackButtonLook = 'quiet' | 'outline' | 'solid'

interface BackToMenuButtonProps {
  onBack: () => void
  /** Page Designer wording; unset = the store's "Back to menu" label. */
  label?: string
  /** Page Designer design; unset = today's quiet text button. */
  look?: BackButtonLook
}

const LOOKS: Record<BackButtonLook, { className: string; style: CSSProperties }> = {
  quiet: {
    className: 'rounded-full text-sm font-semibold transition-opacity hover:opacity-80',
    style: { color: 'var(--trk-text-muted)' },
  },
  outline: {
    className: 'border-2 text-sm font-semibold transition-opacity hover:opacity-80',
    style: { borderRadius: 'var(--trk-radius-pill)', borderColor: 'var(--trk-accent)', color: 'var(--trk-accent)' },
  },
  solid: {
    className: 'text-sm font-semibold shadow-sm transition-opacity hover:opacity-90',
    style: { borderRadius: 'var(--trk-radius-pill)', backgroundColor: 'var(--trk-accent)', color: 'var(--trk-on-accent)' },
  },
}

/** The quiet button at the foot of the order page. */
export function BackToMenuButton({ onBack, label, look = 'quiet' }: BackToMenuButtonProps) {
  const { className, style } = LOOKS[look]
  return (
    <div className="pb-8 pt-2">
      <button
        type="button"
        onClick={onBack}
        className={`flex h-12 w-full items-center justify-center gap-2 ${className}`}
        style={style}
      >
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        {label ?? <StoreLabel name="tracking.back" fallback="Back to menu" />}
      </button>
    </div>
  )
}
