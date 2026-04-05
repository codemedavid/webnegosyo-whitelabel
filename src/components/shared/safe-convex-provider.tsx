'use client'

import { Component, type ReactNode, type ErrorInfo, useMemo, useEffect } from 'react'
import { ConvexProvider } from 'convex/react'
import { ConvexReactClient } from 'convex/react'

class ConvexErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(err: Error, info: ErrorInfo) {
    console.warn('Convex error caught:', err.message, info)
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null
    }
    return this.props.children
  }
}

interface SafeConvexProviderProps {
  url: string
  children: ReactNode
  fallback?: ReactNode
}

/**
 * Wraps ConvexProvider with:
 * - Per-mount client lifecycle (creates on mount, closes on unmount)
 * - Built-in error boundary to prevent crashes from missing Convex functions
 */
export function SafeConvexProvider({ url, children, fallback }: SafeConvexProviderProps) {
  const client = useMemo(() => new ConvexReactClient(url), [url])

  useEffect(() => {
    return () => {
      client.close()
    }
  }, [client])

  return (
    <ConvexErrorBoundary fallback={fallback}>
      <ConvexProvider client={client}>
        {children}
      </ConvexProvider>
    </ConvexErrorBoundary>
  )
}
