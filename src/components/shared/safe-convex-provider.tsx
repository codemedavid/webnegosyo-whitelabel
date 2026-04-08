'use client'

import { Component, type ReactNode, type ErrorInfo } from 'react'
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

// Module-level cache of Convex clients keyed by URL.
// This follows the official Convex pattern of long-lived singleton clients
// and avoids React strict-mode double-mount issues entirely.
const clientCache = new Map<string, ConvexReactClient>()

function getClient(url: string): ConvexReactClient {
  let client = clientCache.get(url)
  if (!client) {
    client = new ConvexReactClient(url)
    clientCache.set(url, client)
  }
  return client
}

interface SafeConvexProviderProps {
  url: string
  children: ReactNode
  fallback?: ReactNode
}

/**
 * Wraps ConvexProvider with:
 * - Cached client per URL (survives React strict-mode double-mount)
 * - Built-in error boundary to prevent crashes from missing Convex functions
 */
export function SafeConvexProvider({ url, children, fallback }: SafeConvexProviderProps) {
  const client = getClient(url)

  return (
    <ConvexErrorBoundary fallback={fallback}>
      <ConvexProvider client={client}>
        {children}
      </ConvexProvider>
    </ConvexErrorBoundary>
  )
}
