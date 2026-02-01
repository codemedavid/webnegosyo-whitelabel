'use client'

import { useEffect, useState, useMemo } from 'react'
import type { BrandingColors } from '@/lib/branding-utils'
import type { ProductDetailSettings, ProductDetailColors } from '@/lib/product-detail-theme'
import { mergeSettingsWithBranding, getProductDetailThemeCSS, computeProductDetailStyles } from '@/lib/product-detail-theme'
import { getProductDetailSettings } from '@/app/actions/product-detail-settings'

interface UseProductDetailThemeResult {
    settings: ProductDetailSettings | null
    colors: ProductDetailColors | null
    cssVariables: React.CSSProperties
    styles: ReturnType<typeof computeProductDetailStyles> | null
    isLoading: boolean
    error: string | null
}

export function useProductDetailTheme(
    tenantId: string,
    branding: BrandingColors
): UseProductDetailThemeResult {
    const [settings, setSettings] = useState<ProductDetailSettings | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let isCancelled = false

        async function loadSettings() {
            try {
                setIsLoading(true)
                setError(null)

                const result = await getProductDetailSettings(tenantId)
                
                if (isCancelled) return

                if (result.success) {
                    setSettings(result.data ?? null)
                } else {
                    setError(result.error || 'Failed to load settings')
                }
            } catch (err) {
                if (!isCancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load settings')
                }
            } finally {
                if (!isCancelled) {
                    setIsLoading(false)
                }
            }
        }

        loadSettings()

        return () => {
            isCancelled = true
        }
    }, [tenantId])

    const colors = useMemo(() => {
        return mergeSettingsWithBranding(settings, branding)
    }, [settings, branding])

    const cssVariables = useMemo(() => {
        return getProductDetailThemeCSS(colors)
    }, [colors])

    const styles = useMemo(() => {
        return computeProductDetailStyles(colors)
    }, [colors])

    return {
        settings,
        colors,
        cssVariables,
        styles,
        isLoading,
        error,
    }
}
