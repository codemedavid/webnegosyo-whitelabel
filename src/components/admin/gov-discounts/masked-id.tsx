'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { maskIdNumber } from '@/lib/gov-discount'

export interface MaskedIdProps {
  idNumber: string
  claimantName: string
}

/**
 * An ID number, masked until asked for.
 *
 * Privacy by default, not security: whoever sees this page already passed the
 * ledger's RLS. It keeps a full OSCA/PWD number off a screen someone else can
 * glance at over the owner's shoulder.
 */
export function MaskedId({ idNumber, claimantName }: MaskedIdProps) {
  const [isShown, setIsShown] = useState(false)
  const Icon = isShown ? EyeOff : Eye

  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-xs tabular-nums">{isShown ? idNumber : maskIdNumber(idNumber)}</span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setIsShown((value) => !value)
        }}
        className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={isShown ? `Hide ID number of ${claimantName}` : `Show ID number of ${claimantName}`}
        aria-pressed={isShown}
      >
        <Icon className="h-3.5 w-3.5" />
      </button>
    </span>
  )
}
