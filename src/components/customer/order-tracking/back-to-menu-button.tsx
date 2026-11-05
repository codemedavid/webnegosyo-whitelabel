'use client'

import { ArrowLeft } from 'lucide-react'
import { StoreLabel } from '@/components/customer/storefront-labels-provider'

interface BackToMenuButtonProps {
  onBack: () => void
  /** Page Designer wording; unset = the store's "Back to menu" label. */
  label?: string
}

/** The quiet button at the foot of the order page. */
export function BackToMenuButton({ onBack, label }: BackToMenuButtonProps) {
  return (
    <div className="pb-8 pt-2">
      <button
        type="button"
        onClick={onBack}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold transition-opacity hover:opacity-80"
        style={{ color: 'var(--trk-text-muted)' }}
      >
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        {label ?? <StoreLabel name="tracking.back" fallback="Back to menu" />}
      </button>
    </div>
  )
}
