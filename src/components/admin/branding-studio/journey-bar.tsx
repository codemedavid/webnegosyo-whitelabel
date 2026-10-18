'use client'

/**
 * The diner's journey above the preview — Welcome › Menu › Item › Cart ›
 * Checkout — so owners move screen to screen the way a customer does.
 */

import type { BrandingSurface } from '@/lib/branding-registry'

export const JOURNEY_STEPS: ReadonlyArray<{ surfaceId: BrandingSurface['id']; label: string }> = [
    { surfaceId: 'welcome', label: 'Welcome' },
    { surfaceId: 'storefront', label: 'Menu' },
    { surfaceId: 'product', label: 'Item' },
    { surfaceId: 'cart', label: 'Cart' },
    { surfaceId: 'checkout', label: 'Checkout' },
]

interface JourneyBarProps {
    surfaceId: BrandingSurface['id']
    onPick: (surfaceId: BrandingSurface['id']) => void
}

export function JourneyBar({ surfaceId, onPick }: JourneyBarProps) {
    return (
        <nav aria-label="Customer journey" className="mx-auto mb-3 flex max-w-full flex-wrap items-center justify-center gap-1 max-md:hidden">
            {JOURNEY_STEPS.map((step, index) => {
                const isCurrent = step.surfaceId === surfaceId
                return (
                    <span key={step.surfaceId} className="flex items-center gap-1">
                        {index > 0 && <span aria-hidden="true" className="text-[12px] text-[#B5AEA2]">›</span>}
                        <button
                            type="button"
                            onClick={() => onPick(step.surfaceId)}
                            aria-current={isCurrent ? 'page' : undefined}
                            className={`rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors ${
                                isCurrent ? 'bg-[#1D1815] text-white' : 'text-[#5E574C] hover:bg-white'
                            }`}
                        >
                            {step.label}
                        </button>
                    </span>
                )
            })}
        </nav>
    )
}
