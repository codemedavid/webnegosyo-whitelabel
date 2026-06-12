import { useEffect, useMemo } from 'react'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { useAuthStore } from './stores/auth-store'
import { LoginScreen } from './screens/LoginScreen'
import { OrdersScreen } from './screens/OrdersScreen'

export function App(): React.JSX.Element {
  const { isLoading, isAuthenticated, convexUrl, restore, logout, tenantName } = useAuthStore()

  useEffect(() => {
    void restore()
  }, [restore])

  const convexClient = useMemo(() => {
    if (!convexUrl) return null
    try {
      return new ConvexReactClient(convexUrl, { unsavedChangesWarning: false })
    } catch {
      return null
    }
  }, [convexUrl])

  useEffect(() => {
    return () => {
      void convexClient?.close()
    }
  }, [convexClient])

  if (isLoading) {
    return <div className="center-fill">Loading…</div>
  }

  if (!isAuthenticated) {
    return <LoginScreen />
  }

  if (!convexClient) {
    return (
      <div className="center-fill">
        <p>
          <strong>{tenantName}</strong> has no real-time backend configured.
        </p>
        <p>Ask the platform admin to set a Convex deployment URL for this store.</p>
        <button className="btn" onClick={() => void logout()}>
          Sign out
        </button>
      </div>
    )
  }

  return (
    <ConvexProvider client={convexClient}>
      <OrdersScreen />
    </ConvexProvider>
  )
}
