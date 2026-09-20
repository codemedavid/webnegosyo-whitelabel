'use client'

import { useEffect, useState } from 'react'
import { reportClientError } from '@/lib/report-client-error'
import { isInterruptedLoad, isResourceLoadError, recoverChunkLoad } from '@/lib/client-resource-recovery'

export interface RouteErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

// Keep recovery independent of the cart, tenant, query, and UI providers.
// Inline styles also work when global-error replaces the root layout.
export function RouteErrorFallback({ error, reset, boundary }: RouteErrorProps & { boundary: string }) {
  // An aborted load from a backgrounded or offline tab is an interruption, not a
  // crash: it must not be reported, and it recovers on its own when the tab returns.
  const [isInterrupted, setIsInterrupted] = useState(false)

  useEffect(() => {
    const interrupted = isInterruptedLoad(error, {
      visibility: document.visibilityState,
      online: navigator.onLine,
    })
    setIsInterrupted(interrupted)
    if (!interrupted) reportClientError(error, boundary)
    recoverChunkLoad(error)
  }, [error, boundary])

  useEffect(() => {
    if (!isInterrupted) return
    const retryWhenVisible = () => {
      if (document.visibilityState === 'visible') reset()
    }
    document.addEventListener('visibilitychange', retryWhenVisible)
    return () => document.removeEventListener('visibilitychange', retryWhenVisible)
  }, [isInterrupted, reset])

  return (
    <main style={{ padding: '80px 24px', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 24, fontWeight: 600 }}>
        {isInterrupted ? 'Connection interrupted' : 'Something went wrong'}
      </h1>
      <p style={{ margin: '16px auto', maxWidth: 440 }}>
        {isInterrupted
          ? 'This page stopped loading while the tab was in the background. It will retry on its own — or try again now.'
          : "We couldn't load this page. Try again, or reload the page if the problem continues."}
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
        <button type="button" onClick={() => {
          if (isResourceLoadError(error) && !isInterrupted) window.location.reload()
          else reset()
        }} style={{ padding: '10px 16px', border: '1px solid currentColor', borderRadius: 6, cursor: 'pointer' }}>
          Try again
        </button>
        <button type="button" onClick={() => window.location.reload()} style={{ padding: '10px 16px', border: '1px solid currentColor', borderRadius: 6, cursor: 'pointer' }}>
          Reload page
        </button>
      </div>
    </main>
  )
}
