'use client'

import { ConvexProvider } from 'convex/react'
import { getConvexClient } from '@/lib/convex/client'
import { ProductAnalyticsContent } from '@/components/admin/product-analytics-content'

interface ProductAnalyticsWrapperProps {
  convexUrl: string
}

export function ProductAnalyticsWrapper({ convexUrl }: ProductAnalyticsWrapperProps) {
  const client = getConvexClient(convexUrl)
  return (
    <ConvexProvider client={client}>
      <ProductAnalyticsContent />
    </ConvexProvider>
  )
}
