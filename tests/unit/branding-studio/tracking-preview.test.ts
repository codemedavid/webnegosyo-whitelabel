/**
 * The Studio's sample order page: the owner picks what it shows, untrusted
 * draft meta can't break it, and editing a setting brings its part on screen.
 */

import {
    DEFAULT_TRACKING_PREVIEW,
    STUDIO_PREVIEW_PARAM,
    focusTrackingPreview,
    parseTrackingPreview,
    previewItemsFrom,
    sampleOffer,
    sampleStampCard,
    sampleStampView,
    sampleTrackingData,
} from '@/lib/branding-studio/tracking-preview'
import { BRANDING_PREVIEW_PARAM } from '@/hooks/use-branding-preview'
import { getPreviewTarget } from '@/components/admin/branding-studio/preview-routes'
import { TRACKING_COLOR_KEYS } from '@/lib/tracking-style/keys'

describe('tracking preview state', () => {
    it('reads a valid state and drops anything else', () => {
        expect(parseTrackingPreview({ status: 'ready', loyalty: 'reward', extras: ['pickup', 'nope'] }))
            .toEqual({ status: 'ready', loyalty: 'reward', extras: ['pickup'] })
        expect(parseTrackingPreview('x')).toEqual(DEFAULT_TRACKING_PREVIEW)
        expect(parseTrackingPreview({ status: '__proto__', extras: 'pickup' })).toEqual(DEFAULT_TRACKING_PREVIEW)
    })

    it('uses the same query param as the preview bridge', () => {
        expect(STUDIO_PREVIEW_PARAM).toBe(BRANDING_PREVIEW_PARAM)
    })

    it('opens the sample order page for both screens', () => {
        expect(getPreviewTarget('kape', 'tracking').path).toBe('/kape/order/studio-preview')
        expect(getPreviewTarget('kape', 'loyalty').path).toBe('/kape/order/studio-preview')
    })
})

describe('sample order', () => {
    it('is finished once completed or cancelled', () => {
        expect(sampleTrackingData({ ...DEFAULT_TRACKING_PREVIEW, status: 'delivered' }).isTerminal).toBe(true)
        expect(sampleTrackingData(DEFAULT_TRACKING_PREVIEW).isTerminal).toBe(false)
    })

    it('becomes a pickup order when the pickup code is shown', () => {
        expect(sampleTrackingData({ ...DEFAULT_TRACKING_PREVIEW, extras: ['pickup'] }).orderTypeKind).toBe('pickup')
    })

    it('names its lines after the store\'s own dishes', () => {
        const items = previewItemsFrom([
            { name: 'Sold out', price: 99, is_available: false },
            { name: 'Sisig', price: 180 },
            { name: 'Halo-halo', price: 120 },
            { name: 'Extra', price: 50 },
        ])

        expect(items.map((item) => item.name)).toEqual(['Sisig', 'Halo-halo'])
        expect(items[0].subtotal).toBe(360)
        expect(previewItemsFrom([]).length).toBeGreaterThan(0)
    })

    it('shows the store\'s real offer, or a sample card', () => {
        const real = { programName: 'Kape Club', earnMode: 'stamp' as const, threshold: 10, rewardLabel: 'Free latte', minSpend: null }

        expect(sampleOffer(real, 'collecting').programName).toBe('Kape Club')
        expect(sampleOffer(null, 'collecting').threshold).toBeGreaterThan(0)
        expect(sampleOffer(real, 'points').earnMode).toBe('points')
    })

    it('gives each card face the data it needs', () => {
        const offer = sampleOffer(null, 'reward')

        expect(sampleStampView('join')).toBe('claim')
        expect(sampleStampView('none')).toBeNull()
        expect(sampleStampCard(offer, 'reward')?.rewardsAvailable).toBe(1)
        expect(sampleStampCard(offer, 'join')).toBeNull()
    })
})

describe('focusTrackingPreview', () => {
    it('shows the part a setting changes', () => {
        const start = { status: 'delivered' as const, loyalty: 'none' as const, extras: [] }

        expect(focusTrackingPreview(start, ['tracking_style.pickup_border']).extras).toContain('pickup')
        expect(focusTrackingPreview(start, ['tracking_style.ring_text']).status).toBe('preparing')
        expect(focusTrackingPreview(start, ['tracking_style.cancelled_color']).status).toBe('cancelled')
        expect(focusTrackingPreview(start, ['tracking_style.stamp_color']).loyalty).toBe('collecting')
        expect(focusTrackingPreview(start, ['storefront_labels.loyalty.claim_button']).loyalty).toBe('join')
        expect(focusTrackingPreview(start, ['storefront_labels.tracking.ready_headline']).status).toBe('ready')
    })

    it('keeps the owner\'s choice for settings that are always on screen', () => {
        expect(focusTrackingPreview(DEFAULT_TRACKING_PREVIEW, ['tracking_style.page_background'])).toEqual(DEFAULT_TRACKING_PREVIEW)
    })

    it('can show every loyalty colour (none needs a hidden state)', () => {
        const loyaltyKeys = TRACKING_COLOR_KEYS.filter((key) => /^(loyalty_|band_|stamp_|input_|wallet_)/.test(key))
        const hidden = { ...DEFAULT_TRACKING_PREVIEW, loyalty: 'none' as const }

        for (const key of loyaltyKeys) {
            expect([key, focusTrackingPreview(hidden, [`tracking_style.${key}`]).loyalty]).not.toEqual([key, 'none'])
        }
    })
})
