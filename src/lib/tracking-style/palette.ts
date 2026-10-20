/**
 * Every colour the order-tracking page and the loyalty card paint with,
 * worked out from the store's brand and the owner's `tracking_style`.
 *
 * - A blank setting gives exactly what the page painted before these settings
 *   existed (the brand-derived values), so untouched stores don't change.
 * - Settings chain: the loyalty card follows the page, the page follows the
 *   brand. Changing the page accent moves the stamps too, until the owner
 *   gives the stamps their own colour.
 * - Text is kept readable on whatever it sits on, but only where the owner
 *   changed one side of the pair: a readable pick is kept exactly, an
 *   unreadable one is shown in the nearest readable shade (the Studio flags
 *   it with the same one-tap fix, `listTrackingContrastIssues`).
 */

import type { BrandingColors } from '@/lib/branding-utils'
import type { TrackingColorKey, TrackingStyle } from '@/lib/tracking-style/keys'
import {
    resolveAlert,
    resolveBand,
    resolveHeader,
    resolveHero,
    resolveLoyaltyCard,
    resolvePage,
    resolvePickup,
    resolveRing,
    resolveStampsAndButtons,
    resolveTimelineAndSummary,
} from '@/lib/tracking-style/palette-parts'

export interface TrackingPalette {
    // Page
    background: string
    glow: string
    card: string
    cardBorder: string
    text: string
    textMuted: string
    textFaint: string
    accent: string
    accentSoft: string
    accentTint: string
    accentStrong: string
    onAccent: string
    cta: string
    onCta: string
    success: string
    successSoft: string
    warning: string
    warningSoft: string
    error: string
    radius: string
    radiusInner: string
    radiusPill: string
    // Header
    headerBackground: string
    headerText: string
    headerMuted: string
    live: string
    liveSoft: string
    // Status banner
    heroBackground: string
    heroBorder: string
    heroText: string
    heroChip: string
    heroChipSoft: string
    heroDecor: string
    heroTrack: string
    heroBar: string
    cancelledBackground: string
    cancelledText: string
    // Ring-me button
    ringBackground: string
    ringText: string
    ringBorder: string
    ringArmed: string
    ringArmedSoft: string
    // Timeline
    stepDone: string
    onStepDone: string
    stepCurrent: string
    onStepCurrent: string
    stepCurrentSoft: string
    stepUpcoming: string
    // Order summary
    total: string
    qtyBackground: string
    qtyText: string
    // Pickup code
    pickupBackground: string
    pickupBorder: string
    pickupText: string
    pickupMuted: string
    pickupReady: string
    pickupReadyBackground: string
    // Ready alert
    alertBackground: string
    alertText: string
    alertButton: string
    alertButtonText: string
    // Loyalty card
    loyaltyBackground: string
    loyaltyBorder: string
    loyaltyText: string
    loyaltyMuted: string
    loyaltyFaint: string
    inputBackground: string
    inputText: string
    inputPlaceholder: string
    bandBackground: string
    bandText: string
    bandBorder: string
    bandChip: string
    bandSoft: string
    bandSoftText: string
    bandInk: string
    stamp: string
    stampSoft: string
    stampTint: string
    onStamp: string
    stampEmpty: string
    stampNext: string
    stampNextTint: string
    stampBadge: string
    onStampBadge: string
    stampReached: string
    onStampReached: string
    stampRadius: string
    loyaltyButton: string
    loyaltyButtonText: string
    loyaltyLink: string
    walletBackground: string
    walletText: string
    walletMuted: string
}

export interface TrackingContrastIssue {
    key: TrackingColorKey
    ratio: number
    minRatio: number
    /** The readable ink customers see instead. */
    fix: string
}

interface Resolved {
    palette: TrackingPalette
    issues: TrackingContrastIssue[]
    /** The colour each setting currently comes to (its own value, or what it follows). */
    settings: Record<TrackingColorKey, string>
}

function resolveAll(branding: BrandingColors, trackingStyle: TrackingStyle): Resolved {
    const { colors, options } = trackingStyle
    const page = resolvePage(branding, colors, options)
    const hero = resolveHero(page.palette, colors, options)
    const card = resolveLoyaltyCard(page.palette, colors)
    const parts = [
        page,
        resolveHeader(page.palette, colors),
        hero,
        resolveRing(page.palette, colors),
        resolveTimelineAndSummary(page.palette, colors),
        resolvePickup(page.palette, colors),
        resolveAlert(colors, hero.settings.hero_color ?? page.palette.accent),
        card,
        resolveBand(page.palette, card.palette, colors, options),
        resolveStampsAndButtons(page.palette, card.palette, colors, options),
    ]
    return {
        palette: Object.assign({}, ...parts.map((part) => part.palette)) as TrackingPalette,
        settings: Object.assign({}, ...parts.map((part) => part.settings)) as Record<TrackingColorKey, string>,
        issues: parts.flatMap((part) => part.issues).filter((issue): issue is TrackingContrastIssue => issue !== null),
    }
}

/** What the page and the loyalty card paint with. */
export function resolveTrackingPalette(branding: BrandingColors, trackingStyle: TrackingStyle): TrackingPalette {
    return resolveAll(branding, trackingStyle).palette
}

/** The colour every setting comes to right now — what the Studio shows beside a blank setting. */
export function resolveTrackingSettingColors(branding: BrandingColors, trackingStyle: TrackingStyle): Record<TrackingColorKey, string> {
    return resolveAll(branding, trackingStyle).settings
}

/** Owner choices that don't read on their background (shown in readable ink instead). */
export function listTrackingContrastIssues(branding: BrandingColors, trackingStyle: TrackingStyle): TrackingContrastIssue[] {
    return resolveAll(branding, trackingStyle).issues
}
