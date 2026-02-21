/**
 * Unit tests for product-detail-theme.ts
 */

import {
    mergeSettingsWithBranding,
    getProductDetailThemeCSS,
    computeProductDetailStyles,
    DEFAULT_PRODUCT_DETAIL_SETTINGS,
    type ProductDetailSettings,
    type ProductDetailColors
} from '@/lib/product-detail-theme'
import type { BrandingColors } from '@/lib/branding-utils'

describe('Product Detail Theme', () => {
    const mockBranding: BrandingColors = {
        primary: '#3b82f6',
        secondary: '#64748b',
        background: '#ffffff',
        header: '#ffffff',
        headerFont: '#374151',
        cards: '#f9fafb',
        cardsBorder: '#e5e7eb',
        cardTitle: '#111827',
        cardPrice: '#3b82f6',
        cardDescription: '#6b7280',
        modalBackground: '#ffffff',
        modalTitle: '#111827',
        modalPrice: '#3b82f6',
        modalDescription: '#6b7280',
        textPrimary: '#111827',
        textSecondary: '#6b7280',
        textMuted: '#9ca3af',
        border: '#e5e7eb',
        buttonPrimary: '#3b82f6',
        buttonPrimaryText: '#ffffff',
        buttonSecondary: '#ffffff',
        buttonSecondaryText: '#111827',
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
        link: '#3b82f6',
        shadow: 'rgba(0, 0, 0, 0.1)',
        accent: '#ffd700'
    }

    describe('mergeSettingsWithBranding', () => {
        it('should use default values when settings is null', () => {
            const result = mergeSettingsWithBranding(null, mockBranding)

            expect(result.pageBackground).toBe(mockBranding.background)
            expect(result.productName).toBe(mockBranding.textPrimary)
            expect(result.buyNowButtonLabel).toBe('Buy Now')
            expect(result.addToCartButtonLabel).toBe('Add To Cart')
            expect(result.primary).toBe(mockBranding.primary)
            expect(result.enableAnimations).toBe(true)
        })

        it('should override branding with custom settings', () => {
            const customSettings: ProductDetailSettings = {
                tenant_id: 'tenant-1',
                page_background_color: '#ff0000',
                product_name_color: '#00ff00',
                enable_animations: false
            }

            const result = mergeSettingsWithBranding(customSettings, mockBranding)

            expect(result.pageBackground).toBe('#ff0000')
            expect(result.productName).toBe('#00ff00')
            expect(result.enableAnimations).toBe(false)
        })

        it('should use branding colors when settings values are empty', () => {
            const customSettings: ProductDetailSettings = {
                tenant_id: 'tenant-1',
                page_background_color: '',  // Empty string
                product_name_color: undefined
            }

            const result = mergeSettingsWithBranding(customSettings, mockBranding)

            // Empty strings should fall through to branding defaults
            expect(result.pageBackground).toBe(mockBranding.background)
            expect(result.productName).toBe(mockBranding.textPrimary)
        })

        it('should handle undefined settings gracefully', () => {
            const result = mergeSettingsWithBranding(undefined as any, mockBranding)

            expect(result).toBeDefined()
            expect(result.pageBackground).toBe(mockBranding.background)
        })
    })

    describe('getProductDetailThemeCSS', () => {
        it('should generate valid CSS properties', () => {
            const colors = mergeSettingsWithBranding(null, mockBranding)
            const cssVars = getProductDetailThemeCSS(colors)

            // Check that all CSS variables are strings (valid CSS values)
            Object.entries(cssVars).forEach(([key, value]) => {
                if (key.startsWith('--')) {
                    expect(typeof value).toBe('string')
                    expect(value).not.toBeNull()
                    expect(value).not.toBeUndefined()
                }
            })
        })

        it('should have proper fallback values for all CSS variables', () => {
            const colors = mergeSettingsWithBranding(null, mockBranding)
            const cssVars = getProductDetailThemeCSS(colors)

            // Check specific critical variables have values
            expect(cssVars['--pd-page-background']).toBeTruthy()
            expect(cssVars['--pd-product-name']).toBeTruthy()
            expect(cssVars['--pd-primary']).toBeTruthy()
            expect(cssVars['--pd-transition-duration']).toMatch(/\d+s/)
        })

        it('should handle animation speed settings', () => {
            const colors = mergeSettingsWithBranding(null, mockBranding)

            // Test normal speed
            colors.animationSpeed = 'normal'
            let cssVars = getProductDetailThemeCSS(colors)
            expect(cssVars['--pd-transition-duration']).toBe('0.3s')

            // Test slow speed
            colors.animationSpeed = 'slow'
            cssVars = getProductDetailThemeCSS(colors)
            expect(cssVars['--pd-transition-duration']).toBe('0.5s')

            // Test fast speed
            colors.animationSpeed = 'fast'
            cssVars = getProductDetailThemeCSS(colors)
            expect(cssVars['--pd-transition-duration']).toBe('0.15s')

            // Test disabled animations
            colors.enableAnimations = false
            cssVars = getProductDetailThemeCSS(colors)
            expect(cssVars['--pd-transition-duration']).toBe('0s')
        })
    })

    describe('computeProductDetailStyles', () => {
        it('should compute dynamic styles object', () => {
            const colors = mergeSettingsWithBranding(null, mockBranding)
            const styles = computeProductDetailStyles(colors)

            expect(styles.container).toBeDefined()
            expect(styles.name).toBeDefined()
            expect(styles.description).toBeDefined()
            expect(styles.variationButton).toBeDefined()
            expect(styles.variationButtonSelected).toBeDefined()
            expect(styles.addonButton).toBeDefined()
            expect(styles.addonButtonSelected).toBeDefined()
            expect(styles.footer).toBeDefined()
            expect(styles.buttonBuyNow).toBeDefined()
            expect(styles.buttonAddToCart).toBeDefined()
        })

        it('should apply font family to container', () => {
            const customSettings: ProductDetailSettings = {
                tenant_id: 'tenant-1',
                font_family_body: 'Arial, sans-serif'
            }
            const colors = mergeSettingsWithBranding(customSettings, mockBranding)
            const styles = computeProductDetailStyles(colors)

            expect(styles.container.fontFamily).toBe('Arial, sans-serif')
        })
    })

    describe('DEFAULT_PRODUCT_DETAIL_SETTINGS', () => {
        it('should have all required default values', () => {
            expect(DEFAULT_PRODUCT_DETAIL_SETTINGS.page_background_color).toBeDefined()
            expect(DEFAULT_PRODUCT_DETAIL_SETTINGS.product_name_color).toBeDefined()
            expect(DEFAULT_PRODUCT_DETAIL_SETTINGS.variation_required_text).toBe('* Pick 1')
            expect(DEFAULT_PRODUCT_DETAIL_SETTINGS.buy_now_button_label).toBe('Buy Now')
            expect(DEFAULT_PRODUCT_DETAIL_SETTINGS.enable_animations).toBe(true)
            expect(DEFAULT_PRODUCT_DETAIL_SETTINGS.section_padding).toBe('24px')
        })
    })
})
