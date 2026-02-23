'use client'

import { memo } from 'react'
import { Package } from 'lucide-react'
import { BundleCard } from './bundle-card'
import type { BrandingColors } from '@/lib/branding-utils'
import type { BundleWithItems } from '@/lib/bundles-service'

interface BundlesSectionProps {
    bundles: BundleWithItems[]
    onBundleSelect: (bundle: BundleWithItems) => void
    branding: BrandingColors
    hideCurrencySymbol?: boolean
}

/**
 * Renders a "Bundles" section on the customer menu with a themed header and card grid.
 */
export const BundlesSection = memo(function BundlesSection({
    bundles,
    onBundleSelect,
    branding,
    hideCurrencySymbol,
}: BundlesSectionProps) {
    if (bundles.length === 0) return null

    return (
        <section className="scroll-mt-24 space-y-6">
            {/* Section Header */}
            <div className="flex items-center gap-3">
                <div
                    className="flex h-12 w-12 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${branding.primary}15` }}
                >
                    <Package className="h-6 w-6" style={{ color: branding.primary }} />
                </div>
                <div>
                    <h2
                        className="text-2xl font-bold"
                        style={{ color: branding.menuCategoryHeader }}
                    >
                        Bundles
                    </h2>
                    <p
                        className="text-sm"
                        style={{ color: branding.textMuted }}
                    >
                        {bundles.length} bundle{bundles.length !== 1 ? 's' : ''} available
                    </p>
                </div>
            </div>

            {/* Bundle cards grid */}
            <div className="grid gap-3 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {bundles.map((bundle) => (
                    <BundleCard
                        key={bundle.id}
                        bundle={bundle}
                        onSelect={onBundleSelect}
                        branding={branding}
                        hideCurrencySymbol={hideCurrencySymbol}
                    />
                ))}
            </div>
        </section>
    )
})
