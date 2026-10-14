'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ShieldCheck, X } from 'lucide-react'
import { reviewDismissKey } from '@/lib/staff/staff-access-review'

interface ReviewStaffAccessCardProps {
  tenantId: string
  href: string
  title: string
  detail: string
}

function readDismissed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeDismissed(key: string): void {
  try {
    window.localStorage.setItem(key, '1')
  } catch {
    // Blocked storage: the card simply comes back next visit.
  }
}

/**
 * The owner's one-time "Review staff access" card. Hidden until the browser
 * has said whether it was dismissed, so a dismissed card never flashes in.
 * Dismissal is per store and per browser; the card also stops appearing for
 * good once no staff account is left on full access.
 */
export function ReviewStaffAccessCard({ tenantId, href, title, detail }: ReviewStaffAccessCardProps) {
  const key = reviewDismissKey(tenantId)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    setIsVisible(!readDismissed(key))
  }, [key])

  if (!isVisible) return null

  const handleDismiss = () => {
    writeDismissed(key)
    setIsVisible(false)
  }

  return (
    <section
      aria-labelledby="review-staff-access-title"
      className="flex items-start gap-3.5 rounded-2xl border border-wn-line bg-wn-sand px-4 py-3.5"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-wn-ink text-white" aria-hidden>
        <ShieldCheck className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <h2 id="review-staff-access-title" className="text-[14.5px] font-extrabold text-wn-ink">
          {title}
        </h2>
        <p className="text-[13px] text-wn-stone">{detail}</p>
        <Link
          href={href}
          className="inline-flex items-center gap-1 pt-1 text-[13.5px] font-bold text-wn-coral-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-coral focus-visible:ring-offset-2"
        >
          Review staff access <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss staff access review"
        className="shrink-0 rounded-md p-1 text-wn-stone hover:bg-wn-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-coral"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </section>
  )
}
