'use client'

import { Component, type ReactNode, type ErrorInfo } from 'react'
import { ConvexProvider } from 'convex/react'
import { ConvexReactClient } from 'convex/react'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { reportClientError } from '@/lib/report-client-error'

class ConvexErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(err: Error, info: ErrorInfo) {
    reportClientError(err, 'convex', info.componentStack)
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

// Only a refresh hint, never an authorization decision. Convex verifies the
// signature and tenant. Tokens issued before the auth hook was repaired can
// still be valid JWTs while missing the membership required by merchant queries.
function hasMerchantClaims(token: string): boolean {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(payload))
    return claims.wn_role === 'superadmin' ||
      (claims.wn_role === 'admin' && typeof claims.wn_tenant_id === 'string')
  } catch {
    return false
  }
}

/**
 * The platform session token, or null when there is none. The store's
 * deployment verifies it against Supabase's JWKS and reads the tenant claim
 * the access-token hook stamps on it; a customer (no session) sends nothing,
 * which is right — their functions do not ask for a token.
 */
async function fetchSessionToken({ forceRefreshToken }: { forceRefreshToken: boolean }): Promise<string | null> {
  try {
    const auth = createSupabaseClient().auth
    const { data, error } = await auth.getSession()
    if (error || !data.session) return null
    const token = data.session.access_token
    if (forceRefreshToken || !hasMerchantClaims(token)) {
      const refreshed = await auth.refreshSession()
      return refreshed.error ? null : refreshed.data.session?.access_token ?? null
    }
    return token
  } catch {
    return null
  }
}

function getClient(url: string): ConvexReactClient {
  let client = clientCache.get(url)
  if (!client) {
    client = new ConvexReactClient(url)
    client.setAuth(fetchSessionToken)
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
  return (
    <ConvexErrorBoundary key={url} fallback={fallback}>
      <ConvexClientProvider url={url}>{children}</ConvexClientProvider>
    </ConvexErrorBoundary>
  )
}

// Construct inside a descendant: an error boundary cannot catch exceptions
// thrown by the component that creates the boundary itself.
function ConvexClientProvider({ url, children }: Pick<SafeConvexProviderProps, 'url' | 'children'>) {
  return <ConvexProvider client={getClient(url)}>{children}</ConvexProvider>
}
