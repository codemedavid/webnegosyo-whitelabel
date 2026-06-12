'use client'

import { ProductCostField } from '@/components/admin/product-cost-field'
import { useProductCost, useSetProductCost } from '@/hooks/use-convex-product-analytics'

interface ProductCostFieldConvexProps {
  menuItemId: string
  currentPrice: number
  discountedPrice?: number
}

/**
 * Convex-connected wrapper for ProductCostField.
 *
 * The bare <ProductCostField/> renders the margin calculator but no-ops on save
 * unless it is given a `convexSave` callback (product-cost-field.tsx). This
 * wrapper supplies that callback (and pre-fills any previously saved cost) using
 * the productCosts Convex functions, so cost prices actually persist — which is
 * what unblocks BCG classification (without a saved cost every item stays
 * "unclassified"). Must be rendered inside a <SafeConvexProvider/>.
 */
export function ProductCostFieldConvex({
  menuItemId,
  currentPrice,
  discountedPrice,
}: ProductCostFieldConvexProps) {
  const existing = useProductCost(menuItemId)
  const setCost = useSetProductCost()

  return (
    <ProductCostField
      menuItemId={menuItemId}
      currentPrice={currentPrice}
      discountedPrice={discountedPrice}
      convexSave={async ({ menuItemId, costPrice, costNotes }) => {
        await setCost({ menuItemId, costPrice, costNotes })
      }}
      initialCostPrice={existing?.costPrice}
      initialCostNotes={existing?.costNotes ?? undefined}
    />
  )
}
