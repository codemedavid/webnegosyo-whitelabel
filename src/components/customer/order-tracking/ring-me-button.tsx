'use client'

import { Bell, BellRing } from 'lucide-react'
import { StoreLabel } from '@/components/customer/storefront-labels-provider'
import { RingMeCard } from './ring-me-card'

/** Page Designer wording; each unset line keeps today's words (and the store's labels). */
export interface RingMeWording {
  label?: string
  armed?: string
  armedHint?: string
}

interface RingMeButtonProps {
  isArmed: boolean
  onArm: () => void
  wording?: RingMeWording
  /** Page Designer layout; unset = today's wide button. */
  layout?: 'button' | 'card'
}

const NO_WORDING: RingMeWording = {}

/** The ready-alert opt-in — audio needs a tap, so it can't be automatic. */
export function RingMeButton({ isArmed, onArm, wording = NO_WORDING, layout = 'button' }: RingMeButtonProps) {
  if (layout === 'card') return <RingMeCard isArmed={isArmed} onArm={onArm} wording={wording} />
  return (
    <div className="space-y-1.5" data-branding-scope="tracking/ring">
      <button
        type="button"
        onClick={onArm}
        disabled={isArmed}
        data-part="button"
        className="flex h-12 w-full items-center justify-center gap-2 border-2 text-sm font-semibold transition-colors disabled:cursor-default"
        style={{
          borderRadius: 'var(--trk-radius-pill)',
          ...(isArmed
            ? { borderColor: 'var(--trk-ring-armed)', backgroundColor: 'var(--trk-ring-armed-soft)', color: 'var(--trk-ring-armed)' }
            : { borderColor: 'var(--trk-ring-border)', backgroundColor: 'var(--trk-ring-bg)', color: 'var(--trk-ring-text)' }),
        }}
      >
        {isArmed ? (
          <>
            <BellRing data-part="icon" className="h-4 w-4" aria-hidden="true" />
            {wording.armed ?? <StoreLabel name="tracking.ring_armed" fallback="We'll ring & vibrate when it's ready" />}
          </>
        ) : (
          <>
            <Bell data-part="icon" className="h-4 w-4" aria-hidden="true" />
            {wording.label ?? <StoreLabel name="tracking.ring_me" fallback="Ring me when my order is ready" />}
          </>
        )}
      </button>
      {isArmed && (
        <p data-part="muted" className="text-center text-xs" style={{ color: 'var(--trk-text-muted)' }}>
          {wording.armedHint ?? 'Keep this page open and your volume up.'}
        </p>
      )}
    </div>
  )
}
