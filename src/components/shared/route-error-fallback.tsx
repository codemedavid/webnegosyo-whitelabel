'use client'

import { useEffect } from 'react'
import { reportClientError } from '@/lib/report-client-error'

export interface RouteErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

// Keep recovery independent of the cart, tenant, query, and UI providers.
// Inline styles also work when global-error replaces the root layout.
export function RouteErrorFallback({ error, reset, boundary }: RouteErrorProps & { boundary: string }) {
  useEffect(() => {
    reportClientError(error, boundary)
  }, [error, boundary])

  return (
    <main style={{ padding: '80px 24px', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 24, fontWeight: 600 }}>Something went wrong</h1>
      <p style={{ margin: '16px auto', maxWidth: 440 }}>
        We couldn&apos;t load this page. Try again, or reload the page if the problem continues.
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
        <button type="button" onClick={reset} style={{ padding: '10px 16px', border: '1px solid currentColor', borderRadius: 6, cursor: 'pointer' }}>
          Try again
        </button>
        <button type="button" onClick={() => window.location.reload()} style={{ padding: '10px 16px', border: '1px solid currentColor', borderRadius: 6, cursor: 'pointer' }}>
          Reload page
        </button>
      </div>
    </main>
  )
}
