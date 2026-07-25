'use client'

import { useEffect, useState } from 'react'
import {
  ALWAYS_OPEN_STATUS,
  getStoreOpenStatus,
  type StoreHoursSource,
  type StoreOpenStatus,
} from '@/lib/store-open-status'

/** How often the status re-evaluates, so a page left open crosses closing time. */
const REFRESH_INTERVAL_MS = 60_000

/**
 * Live "is this store taking orders right now" status for client components.
 *
 * Deliberately reports OPEN on the first render: the menu page is statically
 * rendered with ISR (`revalidate = 300`), so anything the server bakes in is up to
 * five minutes stale and would disagree with the client's own clock — a hydration
 * mismatch. Resolving after mount means the banner appears a frame late, which is
 * the right trade against rendering a wrong answer or breaking hydration.
 *
 * Re-evaluates every minute so the closed state appears (and clears) on time.
 */
export function useStoreOpenStatus(source: StoreHoursSource | null | undefined): StoreOpenStatus {
  const [status, setStatus] = useState<StoreOpenStatus>(ALWAYS_OPEN_STATUS)

  const enforce = source?.enforce_operating_hours === true
  const timezone = source?.timezone ?? null
  const hours = source?.operating_hours ?? null

  useEffect(() => {
    if (!enforce) {
      setStatus(ALWAYS_OPEN_STATUS)
      return
    }

    const evaluate = () => {
      setStatus(getStoreOpenStatus(
        { operating_hours: hours, timezone, enforce_operating_hours: true },
        new Date(),
      ))
    }

    evaluate()
    const timer = setInterval(evaluate, REFRESH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [enforce, timezone, hours])

  return status
}
