'use client'

import { SafeConvexProvider } from '@/components/shared/safe-convex-provider'
import { ProductAnalyticsContent } from '@/components/admin/product-analytics-content'

interface ProductAnalyticsWrapperProps {
  convexUrl: string
}

export function ProductAnalyticsWrapper({ convexUrl }: ProductAnalyticsWrapperProps) {
  return (
    <SafeConvexProvider
      url={convexUrl}
      fallback={
        <div className="text-center py-12 text-muted-foreground">
          <p>Analytics data is temporarily unavailable.</p>
        </div>
      }
    >
      <ProductAnalyticsContent />
    </SafeConvexProvider>
  )
}
