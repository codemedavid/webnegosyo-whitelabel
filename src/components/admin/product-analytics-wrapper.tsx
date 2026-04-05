'use client'

import { Component, type ReactNode, type ErrorInfo } from 'react'
import { ConvexProvider } from 'convex/react'
import { getConvexClient } from '@/lib/convex/client'
import { ProductAnalyticsContent } from '@/components/admin/product-analytics-content'

class ConvexErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(err: Error, info: ErrorInfo) { console.warn('Convex analytics error:', err, info) }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="text-center py-12 text-muted-foreground">
          <p>Analytics data is temporarily unavailable.</p>
          <button className="text-primary underline mt-2 text-sm" onClick={() => this.setState({ hasError: false })}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

interface ProductAnalyticsWrapperProps {
  convexUrl: string
}

export function ProductAnalyticsWrapper({ convexUrl }: ProductAnalyticsWrapperProps) {
  const client = getConvexClient(convexUrl)
  return (
    <ConvexErrorBoundary>
      <ConvexProvider client={client}>
        <ProductAnalyticsContent />
      </ConvexProvider>
    </ConvexErrorBoundary>
  )
}
