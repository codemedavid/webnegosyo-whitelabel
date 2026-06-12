'use client'

import { SafeConvexProvider } from '@/components/shared/safe-convex-provider'
import { ProductAnalyticsContent, type ProductMenuItem } from '@/components/admin/product-analytics-content'

interface ProductAnalyticsWrapperProps {
  convexUrl: string
  menuItems: ProductMenuItem[]
  menuEngineeringEnabled: boolean
}

export function ProductAnalyticsWrapper({
  convexUrl,
  menuItems,
  menuEngineeringEnabled,
}: ProductAnalyticsWrapperProps) {
  return (
    <SafeConvexProvider
      url={convexUrl}
      fallback={
        <div className="text-center py-12 text-muted-foreground">
          <p>Analytics data is temporarily unavailable.</p>
        </div>
      }
    >
      <ProductAnalyticsContent
        menuItems={menuItems}
        menuEngineeringEnabled={menuEngineeringEnabled}
      />
    </SafeConvexProvider>
  )
}
