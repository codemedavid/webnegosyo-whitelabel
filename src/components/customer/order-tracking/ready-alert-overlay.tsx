'use client'

import { useEffect, useRef } from 'react'
import { BellRing } from 'lucide-react'

interface ReadyAlertOverlayProps {
  title: string
  body: string
  onAcknowledge: () => void
}

/**
 * Full-screen "your order is ready" takeover shown while the alarm rings.
 * One big button silences it — the customer should never hunt for a way to
 * stop the noise.
 */
export function ReadyAlertOverlay({ title, body, onAcknowledge }: ReadyAlertOverlayProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    buttonRef.current?.focus()
  }, [])

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="ready-alert-title"
      aria-describedby="ready-alert-body"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-6 text-center"
      style={{ background: 'linear-gradient(135deg, var(--trk-accent), var(--trk-accent-strong))', color: 'var(--trk-on-accent)' }}
    >
      <span
        className="flex h-28 w-28 items-center justify-center rounded-full border-4 motion-safe:animate-pulse"
        style={{ borderColor: 'currentColor' }}
        aria-hidden="true"
      >
        <BellRing className="h-14 w-14" />
      </span>
      <div className="space-y-2">
        <h2 id="ready-alert-title" className="text-3xl font-bold">
          {title}
        </h2>
        <p id="ready-alert-body" className="text-base opacity-90">
          {body}
        </p>
      </div>
      <button
        ref={buttonRef}
        type="button"
        onClick={onAcknowledge}
        className="h-14 w-full max-w-xs rounded-full text-lg font-semibold shadow-lg"
        style={{ backgroundColor: 'var(--trk-on-accent)', color: 'var(--trk-accent-strong)' }}
      >
        Got it
      </button>
    </div>
  )
}
