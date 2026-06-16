import { useEffect, useMemo } from 'react'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { useAuthStore } from './stores/auth-store'
import { useSyncEngine } from './hooks/useSyncEngine'
import { LoginScreen } from './screens/LoginScreen'
import { OrdersScreen } from './screens/OrdersScreen'
import { UpdatePrompt } from './components/UpdatePrompt'

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

  // Drain queued offline sales to Convex in the background. Called
  // unconditionally (hooks must be stable); the engine no-ops when the client
  // is null, so it's safe before a store has a real-time backend configured.
  useSyncEngine(convexClient)

  useEffect(() => {
    return () => {
      void convexClient?.close()
    }
  }, [convexClient])

  let content: React.JSX.Element
  if (isLoading) {
    content = <div className="center-fill">Loading…</div>
  } else if (!isAuthenticated) {
    content = <LoginScreen />
  } else if (!convexClient) {
    content = (
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
  } else {
    content = (
      <ConvexProvider client={convexClient}>
        <OrdersScreen />
      </ConvexProvider>
    )
  }

  return (
    <>
      {content}
      <UpdatePrompt />
    </>
  )
}
