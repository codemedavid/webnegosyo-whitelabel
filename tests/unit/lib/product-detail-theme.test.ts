/**
 * Unit tests for product detail theme utilities
 * Tests mergeSettingsWithBranding, getProductDetailThemeCSS,
 * computeProductDetailStyles, and DEFAULT_PRODUCT_DETAIL_SETTINGS
 */
import type { BrandingColors } from '@/lib/branding-utils'
import {
    DEFAULT_PRODUCT_DETAIL_SETTINGS,
    mergeSettingsWithBranding,
    getProductDetailThemeCSS,
    computeProductDetailStyles,
    type ProductDetailSettings,

} from '@/lib/product-detail-theme'

// Mock the Supabase client import used by fetchProductDetailSettings
jest.mock('@/lib/supabase/client', () => ({
    createClient: jest.fn(),
}))

/**
 * Mock branding object with distinct colors so assertions can differentiate them.
 * Every required field of BrandingColors is populated.
 */
const mockBranding: BrandingColors = {
    background: '#aa0001',
    header: '#aa0002',
    headerFont: '#aa0003',
    cards: '#aa0004',
    cardsBorder: '#aa0005',
    cardTitle: '#aa0006',
    cardPrice: '#aa0007',
    cardDescription: '#aa0008',
    modalBackground: '#aa0009',
    modalTitle: '#aa000a',
    modalPrice: '#aa000b',
    modalDescription: '#aa000c',
    checkoutModalBackground: '#aa000d',
    checkoutModalTitle: '#aa000e',
    checkoutModalDescription: '#aa000f',
    checkoutModalPrice: '#aa0010',
    checkoutModalButton: '#aa0011',
    checkoutModalButtonText: '#aa0012',
    checkoutModalBorder: '#aa0013',
    buttonPrimary: '#aa0014',
    buttonPrimaryText: '#aa0015',
    buttonSecondary: '#aa0016',
    buttonSecondaryText: '#aa0017',
    textPrimary: '#aa0018',
    textSecondary: '#aa0019',
    textMuted: '#aa001a',
    menuMainHeaderText: '#aa001b',
    menuMainHeaderSubtitle: '#aa001c',
    menuCategoryHeader: '#aa001d',
    menuCategoryActive: '#aa001e',
    menuCategoryInactive: '#aa001f',
    menuCartBadgeBackground: '#aa0020',
    menuCartBadgeText: '#aa0021',
    border: '#aa0022',
    success: '#aa0023',
    warning: '#aa0024',
    error: '#aa0025',
    link: '#aa0026',
    shadow: '#aa0027',
    primary: '#aa0028',
    secondary: '#aa0029',
    accent: '#aa002a',
    searchBar: {
        enabled: true,
        background: null,
        text: null,
        placeholder: null,
        icon: null,
        border: null,
        focusRing: null,
        radius: 'pill',
        style: 'filled',
    },
}

describe('mergeSettingsWithBranding', () => {
    it('returns branding fallbacks when settings is null', () => {
        const result = mergeSettingsWithBranding(null, mockBranding)

        // Fields that use the custom() helper should fall back to branding
        expect(result.pageBackground).toBe(mockBranding.background)
        expect(result.productName).toBe(mockBranding.textPrimary)
        expect(result.description).toBe(mockBranding.textSecondary)
        expect(result.variationSectionTitle).toBe(mockBranding.textPrimary)
        expect(result.addonSectionTitle).toBe(mockBranding.textPrimary)
        expect(result.addonBackground).toBe(mockBranding.cards)
        expect(result.addonText).toBe(mockBranding.textPrimary)
        expect(result.addonBorder).toBe(mockBranding.border)
        expect(result.footerBackground).toBe(mockBranding.cards)
        expect(result.footerBorder).toBe(mockBranding.border)
        expect(result.summaryText).toBe(mockBranding.textMuted)
        expect(result.totalPrice).toBe(mockBranding.textPrimary)
        expect(result.originalPrice).toBe(mockBranding.textMuted)
        expect(result.relatedSectionTitle).toBe(mockBranding.textPrimary)
        expect(result.relatedItemName).toBe(mockBranding.cardTitle)

        // Direct branding fallbacks (no custom() helper)
        expect(result.headerBackground).toBe(mockBranding.header)
        expect(result.headerButtonIcon).toBe(mockBranding.headerFont)
        expect(result.breadcrumb).toBe(mockBranding.textMuted)
        expect(result.breadcrumbActive).toBe(mockBranding.link)
        expect(result.buyNowButtonBackground).toBe(mockBranding.buttonSecondary)
        expect(result.buyNowButtonText).toBe(mockBranding.buttonPrimary)
        expect(result.buyNowButtonBorder).toBe(mockBranding.primary)
        expect(result.addToCartButtonBackground).toBe(mockBranding.buttonPrimary)
        expect(result.addToCartButtonText).toBe(mockBranding.buttonPrimaryText)
        expect(result.relatedItemPrice).toBe(mockBranding.cardPrice)
        expect(result.relatedItemBackground).toBe(mockBranding.cards)

        // Pass-through branding
        expect(result.primary).toBe(mockBranding.primary)
        expect(result.secondary).toBe(mockBranding.secondary)
        expect(result.textPrimary).toBe(mockBranding.textPrimary)
        expect(result.textSecondary).toBe(mockBranding.textSecondary)
        expect(result.textMuted).toBe(mockBranding.textMuted)
        expect(result.border).toBe(mockBranding.border)
    })

    it('uses branding when setting matches default value (custom() helper behavior)', () => {
        // When the setting value equals the default, custom() returns the branding fallback
        const settings: ProductDetailSettings = {
            tenant_id: 'test-tenant',
            page_background_color: '#ffffff', // matches default
            product_name_color: '#111827', // matches default
            description_color: '#6b7280', // matches default
        }

        const result = mergeSettingsWithBranding(settings, mockBranding)

        expect(result.pageBackground).toBe(mockBranding.background)
        expect(result.productName).toBe(mockBranding.textPrimary)
        expect(result.description).toBe(mockBranding.textSecondary)
    })

    it('uses custom value when setting differs from default', () => {
        const settings: ProductDetailSettings = {
            tenant_id: 'test-tenant',
            page_background_color: '#ff0000', // custom, differs from default #ffffff
            product_name_color: '#00ff00', // custom, differs from default #111827
            description_color: '#0000ff', // custom, differs from default #6b7280
            footer_background_color: '#123456',
            footer_border_color: '#654321',
        }

        const result = mergeSettingsWithBranding(settings, mockBranding)

        expect(result.pageBackground).toBe('#ff0000')
        expect(result.productName).toBe('#00ff00')
        expect(result.description).toBe('#0000ff')
        expect(result.footerBackground).toBe('#123456')
        expect(result.footerBorder).toBe('#654321')
    })

    it('preserves text label fields', () => {
        const settings: ProductDetailSettings = {
            tenant_id: 'test-tenant',
            buy_now_button_label: 'Order Now',
            add_to_cart_button_label: 'Add Item',
            variation_required_text: '* Required',
            variation_optional_text: 'Choose one',
            addon_optional_text: '(Not required)',
            footer_empty_summary_text: 'Regular',
        }

        const result = mergeSettingsWithBranding(settings, mockBranding)

        expect(result.buyNowButtonLabel).toBe('Order Now')
        expect(result.addToCartButtonLabel).toBe('Add Item')
        expect(result.variationRequiredText).toBe('* Required')
        expect(result.variationOptionalText).toBe('Choose one')
        expect(result.addonOptionalText).toBe('(Not required)')
        expect(result.footerEmptySummaryText).toBe('Regular')
    })

    it('uses default text labels when settings are null', () => {
        const result = mergeSettingsWithBranding(null, mockBranding)

        expect(result.buyNowButtonLabel).toBe('Buy Now')
        expect(result.addToCartButtonLabel).toBe('Add To Cart')
        expect(result.variationRequiredText).toBe('* Pick 1')
        expect(result.variationOptionalText).toBe('Optional')
        expect(result.addonOptionalText).toBe('(Optional)')
        expect(result.footerEmptySummaryText).toBe('Standard')
    })

    it('returns complete ProductDetailColors object with no undefined values (except pageGradient)', () => {
        const result = mergeSettingsWithBranding(null, mockBranding)

        for (const [key, value] of Object.entries(result)) {
            if (key === 'pageGradient') {
                // pageGradient is optional and can be undefined
                continue
            }
            expect(value).toBeDefined()
            expect(value).not.toBeNull()
        }
    })

    it('uses addon branding fallbacks for selected states', () => {
        const result = mergeSettingsWithBranding(null, mockBranding)

        // addonSelectedText, addonSelectedBorder, addonSelectedCheck all use branding.primary
        expect(result.addonSelectedText).toBe(mockBranding.primary)
        expect(result.addonSelectedBorder).toBe(mockBranding.primary)
        expect(result.addonSelectedCheck).toBe(mockBranding.primary)

        // addonSelectedBackground uses setAlpha(branding.primary, 0.03)
        expect(result.addonSelectedBackground).toContain('rgba(')
        expect(result.addonSelectedBackground).toContain('0.03')
    })

    it('uses variation branding fallbacks for selected states', () => {
        const result = mergeSettingsWithBranding(null, mockBranding)

        // variationOptionSelectedBackground and variationOptionSelectedBorder use branding.primary
        expect(result.variationOptionSelectedBackground).toBe(mockBranding.primary)
        expect(result.variationOptionSelectedBorder).toBe(mockBranding.primary)
    })

    it('uses custom addon selected colors when explicitly set', () => {
        const settings: ProductDetailSettings = {
            tenant_id: 'test-tenant',
            addon_selected_text_color: '#ff1111',
            addon_selected_border_color: '#ff2222',
            addon_selected_check_color: '#ff3333',
            addon_selected_background_color: '#ff4444',
        }

        const result = mergeSettingsWithBranding(settings, mockBranding)

        expect(result.addonSelectedText).toBe('#ff1111')
        expect(result.addonSelectedBorder).toBe('#ff2222')
        expect(result.addonSelectedCheck).toBe('#ff3333')
        expect(result.addonSelectedBackground).toBe('#ff4444')
    })

    it('uses custom variation selected colors when explicitly set', () => {
        const settings: ProductDetailSettings = {
            tenant_id: 'test-tenant',
            variation_option_selected_background_color: '#bb1111',
            variation_option_selected_border_color: '#bb2222',
        }

        const result = mergeSettingsWithBranding(settings, mockBranding)

        expect(result.variationOptionSelectedBackground).toBe('#bb1111')
        expect(result.variationOptionSelectedBorder).toBe('#bb2222')
    })
})

describe('getProductDetailThemeCSS', () => {
    it('returns CSS custom properties for all theme values', () => {
        const colors = mergeSettingsWithBranding(null, mockBranding)
        const css = getProductDetailThemeCSS(colors)

        // Spot-check key CSS custom properties exist and have correct values
        expect(css['--pd-page-background' as keyof typeof css]).toBe(mockBranding.background)
        expect(css['--pd-product-name' as keyof typeof css]).toBe(mockBranding.textPrimary)
        expect(css['--pd-description' as keyof typeof css]).toBe(mockBranding.textSecondary)
        expect(css['--pd-primary' as keyof typeof css]).toBe(mockBranding.primary)
        expect(css['--pd-secondary' as keyof typeof css]).toBe(mockBranding.secondary)
        expect(css['--pd-text-primary' as keyof typeof css]).toBe(mockBranding.textPrimary)
        expect(css['--pd-border' as keyof typeof css]).toBe(mockBranding.border)
        expect(css['--pd-footer-bg' as keyof typeof css]).toBe(mockBranding.cards)
        expect(css['--pd-add-cart-bg' as keyof typeof css]).toBe(mockBranding.buttonPrimary)
        expect(css['--pd-buy-now-bg' as keyof typeof css]).toBe(mockBranding.buttonSecondary)

        // Verify it's a plain object (CSSProperties)
        expect(typeof css).toBe('object')
    })

    it('sets transition duration to 0s when animations disabled', () => {
        const colors = mergeSettingsWithBranding(null, mockBranding)
        colors.enableAnimations = false

        const css = getProductDetailThemeCSS(colors)

        expect(css['--pd-transition-duration' as keyof typeof css]).toBe('0s')
    })

    it('sets correct transition duration for slow speed', () => {
        const colors = mergeSettingsWithBranding(null, mockBranding)
        colors.enableAnimations = true
        colors.animationSpeed = 'slow'

        const css = getProductDetailThemeCSS(colors)

        expect(css['--pd-transition-duration' as keyof typeof css]).toBe('0.5s')
    })

    it('sets correct transition duration for normal speed', () => {
        const colors = mergeSettingsWithBranding(null, mockBranding)
        colors.enableAnimations = true
        colors.animationSpeed = 'normal'

        const css = getProductDetailThemeCSS(colors)

        expect(css['--pd-transition-duration' as keyof typeof css]).toBe('0.3s')
    })

    it('sets correct transition duration for fast speed', () => {
        const colors = mergeSettingsWithBranding(null, mockBranding)
        colors.enableAnimations = true
        colors.animationSpeed = 'fast'

        const css = getProductDetailThemeCSS(colors)

        expect(css['--pd-transition-duration' as keyof typeof css]).toBe('0.15s')
    })
})

describe('computeProductDetailStyles', () => {
    it('returns all required style objects', () => {
        const colors = mergeSettingsWithBranding(null, mockBranding)
        const styles = computeProductDetailStyles(colors)

        expect(styles).toHaveProperty('container')
        expect(styles).toHaveProperty('name')
        expect(styles).toHaveProperty('description')
        expect(styles).toHaveProperty('variationButton')
        expect(styles).toHaveProperty('variationButtonSelected')
        expect(styles).toHaveProperty('addonButton')
        expect(styles).toHaveProperty('addonButtonSelected')
        expect(styles).toHaveProperty('footer')
        expect(styles).toHaveProperty('buttonBuyNow')
        expect(styles).toHaveProperty('buttonAddToCart')
    })

    it('applies branding colors to button styles', () => {
        const colors = mergeSettingsWithBranding(null, mockBranding)
        const styles = computeProductDetailStyles(colors)

        // Buy Now button uses branding fallbacks
        expect(styles.buttonBuyNow.backgroundColor).toBe(mockBranding.buttonSecondary)
        expect(styles.buttonBuyNow.color).toBe(mockBranding.buttonPrimary)
        expect(styles.buttonBuyNow.borderColor).toBe(mockBranding.primary)

        // Add to Cart button uses branding fallbacks
        expect(styles.buttonAddToCart.backgroundColor).toBe(mockBranding.buttonPrimary)
        expect(styles.buttonAddToCart.color).toBe(mockBranding.buttonPrimaryText)
    })

    it('applies branding colors to container and text styles', () => {
        const colors = mergeSettingsWithBranding(null, mockBranding)
        const styles = computeProductDetailStyles(colors)

        expect(styles.container.backgroundColor).toBe(mockBranding.background)
        expect(styles.name.color).toBe(mockBranding.textPrimary)
        expect(styles.description.color).toBe(mockBranding.textSecondary)
    })

    it('applies custom colors when explicitly set', () => {
        const settings: ProductDetailSettings = {
            tenant_id: 'test-tenant',
            page_background_color: '#cc0001',
            product_name_color: '#cc0002',
            description_color: '#cc0003',
            buy_now_button_background: '#cc0004',
            buy_now_button_text_color: '#cc0005',
            buy_now_button_border_color: '#cc0006',
            add_to_cart_button_background: '#cc0007',
            add_to_cart_button_text_color: '#cc0008',
        }

        const colors = mergeSettingsWithBranding(settings, mockBranding)
        const styles = computeProductDetailStyles(colors)

        expect(styles.container.backgroundColor).toBe('#cc0001')
        expect(styles.name.color).toBe('#cc0002')
        expect(styles.description.color).toBe('#cc0003')
        expect(styles.buttonBuyNow.backgroundColor).toBe('#cc0004')
        expect(styles.buttonBuyNow.color).toBe('#cc0005')
        expect(styles.buttonBuyNow.borderColor).toBe('#cc0006')
        expect(styles.buttonAddToCart.backgroundColor).toBe('#cc0007')
        expect(styles.buttonAddToCart.color).toBe('#cc0008')
    })

    it('applies variation and addon styles correctly', () => {
        const colors = mergeSettingsWithBranding(null, mockBranding)
        const styles = computeProductDetailStyles(colors)

        // Variation button defaults
        expect(styles.variationButton.backgroundColor).toBe('#f9fafb')
        expect(styles.variationButton.color).toBe('#374151')
        expect(styles.variationButton.borderColor).toBe('#e5e7eb')

        // Variation selected uses branding.primary
        expect(styles.variationButtonSelected.backgroundColor).toBe(mockBranding.primary)
        expect(styles.variationButtonSelected.borderColor).toBe(mockBranding.primary)

        // Addon button uses branding fallbacks via custom()
        expect(styles.addonButton.backgroundColor).toBe(mockBranding.cards)
        expect(styles.addonButton.color).toBe(mockBranding.textPrimary)
        expect(styles.addonButton.borderColor).toBe(mockBranding.border)

        // Addon selected uses branding.primary
        expect(styles.addonButtonSelected.color).toBe(mockBranding.primary)
        expect(styles.addonButtonSelected.borderColor).toBe(mockBranding.primary)
    })

    it('applies footer styles correctly', () => {
        const colors = mergeSettingsWithBranding(null, mockBranding)
        const styles = computeProductDetailStyles(colors)

        expect(styles.footer.backgroundColor).toBe(mockBranding.cards)
        expect(styles.footer.borderColor).toBe(mockBranding.border)
        expect(styles.footer.boxShadow).toContain(colors.footerShadow)
    })
})

describe('DEFAULT_PRODUCT_DETAIL_SETTINGS', () => {
    it('has no undefined or null values', () => {
        for (const [, value] of Object.entries(DEFAULT_PRODUCT_DETAIL_SETTINGS)) {
            expect(value).toBeDefined()
            expect(value).not.toBeNull()
        }
    })

    it('contains expected default text labels', () => {
        expect(DEFAULT_PRODUCT_DETAIL_SETTINGS.buy_now_button_label).toBe('Buy Now')
        expect(DEFAULT_PRODUCT_DETAIL_SETTINGS.add_to_cart_button_label).toBe('Add To Cart')
        expect(DEFAULT_PRODUCT_DETAIL_SETTINGS.variation_required_text).toBe('* Pick 1')
        expect(DEFAULT_PRODUCT_DETAIL_SETTINGS.variation_optional_text).toBe('Optional')
        expect(DEFAULT_PRODUCT_DETAIL_SETTINGS.addon_optional_text).toBe('(Optional)')
        expect(DEFAULT_PRODUCT_DETAIL_SETTINGS.footer_empty_summary_text).toBe('Standard')
        expect(DEFAULT_PRODUCT_DETAIL_SETTINGS.addon_price_free_text).toBe('Free')
    })

    it('contains expected animation defaults', () => {
        expect(DEFAULT_PRODUCT_DETAIL_SETTINGS.enable_animations).toBe(true)
        expect(DEFAULT_PRODUCT_DETAIL_SETTINGS.animation_speed).toBe('normal')
    })
})
