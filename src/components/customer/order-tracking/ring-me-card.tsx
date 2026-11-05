'use client'

import { Bell, BellRing } from 'lucide-react'
import { StoreLabel } from '@/components/customer/storefront-labels-provider'
import type { RingMeWording } from './ring-me-button'

interface RingMeCardProps {
  isArmed: boolean
  onArm: () => void
  wording: RingMeWording
  showHint?: boolean
}

/**
 * The Page Designer's "card" ring-me: the whole card is the button (one tap
 * arms the alarm, exactly like the standard button), with the bell in a
 * circle and the after-tap hint inside.
 */
export function RingMeCard({ isArmed, onArm, wording, showHint = true }: RingMeCardProps) {
  const Icon = isArmed ? BellRing : Bell
  return (
    <div data-branding-scope="tracking/ring">
      <button
        type="button"
        onClick={onArm}
        disabled={isArmed}
        data-part="button"
        className="flex min-h-16 w-full items-center gap-3 border-2 p-4 text-left transition-colors disabled:cursor-default"
        style={{
          borderRadius: 'var(--trk-radius)',
          ...(isArmed
            ? { borderColor: 'var(--trk-ring-armed)', backgroundColor: 'var(--trk-ring-armed-soft)', color: 'var(--trk-ring-armed)' }
            : { borderColor: 'var(--trk-ring-border)', backgroundColor: 'var(--trk-ring-bg)', color: 'var(--trk-ring-text)' }),
        }}
      >
        <span
          data-part="icon"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: isArmed ? 'var(--trk-ring-armed-soft)' : 'var(--trk-accent-soft)' }}
          aria-hidden="true"
        >
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">
            {isArmed
              ? wording.armed ?? <StoreLabel name="tracking.ring_armed" fallback="We'll ring & vibrate when it's ready" />
              : wording.label ?? <StoreLabel name="tracking.ring_me" fallback="Ring me when my order is ready" />}
          </span>
          {showHint && isArmed && (
            <span data-part="muted" className="mt-0.5 block text-xs" style={{ color: 'var(--trk-text-muted)' }}>
              {wording.armedHint ?? 'Keep this page open and your volume up.'}
            </span>
          )}
        </span>
      </button>
    </div>
  )
}
