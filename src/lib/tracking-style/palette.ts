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

import { darkenColor, getContrastColor, setAlpha, type BrandingColors } from '@/lib/branding-utils'
import { contrastRatio, mixHex, MIN_TEXT_CONTRAST, readableTextOn } from '@/lib/color-contrast'
import type { TrackingColorKey, TrackingOptions, TrackingStyle } from '@/lib/tracking-style/keys'

/** WCAG minimum for large text and icons. */
const LARGE_TEXT_CONTRAST = 3
const STRONG_SHADE = 0.18
const SOFT_ALPHA = 0.12
const TINT_ALPHA = 0.06
const STATE_ALPHA = 0.14
/** How much of the colour a "soft" banner or band mixes into the card. */
const SOFT_FILL = 0.14
const WHITE = '#ffffff'
/** The number box's hint text before these settings existed (Tailwind gray-300). */
const PLACEHOLDER_GREY = '#d1d5db'

const RADII: Record<TrackingOptions['corners'], { card: string; inner: string; pill: string }> = {
    rounded: { card: '1.5rem', inner: '1rem', pill: '9999px' },
    soft: { card: '0.875rem', inner: '0.625rem', pill: '0.75rem' },
    square: { card: '0.25rem', inner: '0.25rem', pill: '0.375rem' },
}

const STAMP_RADII: Record<TrackingOptions['stamp_shape'], string> = {
    circle: '9999px',
    rounded: '30%',
    square: '0.375rem',
}

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
    bandColor: string
    bandSoft: string
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
}

export interface TrackingContrastIssue {
    key: TrackingColorKey
    ratio: number
    minRatio: number
    /** The readable ink customers see instead. */
    fix: string
}

type Colors = TrackingStyle['colors']

const gradient = (from: string, to: string) => `linear-gradient(135deg, ${from}, ${to})`

/** The gradient end `text` reads worst on. */
function worseFillFor(text: string, from: string, to: string): string {
    return (contrastRatio(text, to) ?? Infinity) < (contrastRatio(text, from) ?? Infinity) ? to : from
}

interface ReadablePair {
    text: TrackingColorKey
    /** The colour the text sits on (already resolved). */
    fill: string
    /** Settings that, when the owner set one, put this pair under the floor. */
    ownedBy: readonly TrackingColorKey[]
    minRatio: number
}

/** Readable text: the floor applies only where the owner changed one side. */
function floorText(text: string, pair: ReadablePair, colors: Colors, extraOwned = false): string {
    const isOwned = extraOwned || colors[pair.text] !== undefined || pair.ownedBy.some((key) => colors[key] !== undefined)
    return isOwned ? readableTextOn(text, pair.fill, pair.minRatio) : text
}

function issueFor(text: string, pair: ReadablePair, colors: Colors, extraOwned = false): TrackingContrastIssue | null {
    const isOwned = extraOwned || colors[pair.text] !== undefined || pair.ownedBy.some((key) => colors[key] !== undefined)
    if (!isOwned) return null
    const ratio = contrastRatio(text, pair.fill)
    if (ratio === null || ratio >= pair.minRatio) return null
    return { key: pair.text, ratio, minRatio: pair.minRatio, fix: readableTextOn(text, pair.fill, pair.minRatio) }
}

interface Resolved {
    palette: TrackingPalette
    issues: TrackingContrastIssue[]
    /** The colour each setting currently comes to (its own value, or what it follows). */
    settings: Record<TrackingColorKey, string>
}

/** The page's own colours: background, cards, text, accent. */
function resolvePage(branding: BrandingColors, colors: Colors, options: TrackingOptions) {
    const accent = colors.accent ?? branding.primary
    const card = colors.card_background ?? branding.cards
    const radius = RADII[options.corners]
    return {
        background: colors.page_background ?? branding.background,
        glow: options.show_glow ? setAlpha(colors.page_glow_color ?? accent, SOFT_ALPHA) : 'transparent',
        card,
        cardBorder: colors.card_border ?? branding.cardsBorder,
        rawText: colors.text ?? branding.textPrimary,
        rawMuted: colors.muted_text ?? branding.textSecondary,
        textFaint: colors.muted_text ?? branding.textMuted,
        accent,
        accentSoft: setAlpha(accent, SOFT_ALPHA),
        accentTint: setAlpha(accent, TINT_ALPHA),
        accentStrong: darkenColor(accent, STRONG_SHADE),
        onAccent: getContrastColor(accent),
        cta: branding.buttonPrimary,
        onCta: branding.buttonPrimaryText,
        success: branding.success,
        successSoft: setAlpha(branding.success, STATE_ALPHA),
        warning: branding.warning,
        warningSoft: setAlpha(branding.warning, STATE_ALPHA),
        error: branding.error,
        radius: radius.card,
        radiusInner: radius.inner,
        radiusPill: radius.pill,
    }
}

type Page = ReturnType<typeof resolvePage>

function resolveHero(page: Page, colors: Colors, options: TrackingOptions, text: string) {
    const color = colors.hero_color ?? page.accent
    const end = colors.hero_color_end ?? darkenColor(color, STRONG_SHADE)
    const style = options.hero_style
    const fill = style === 'soft' ? mixHex(page.card, color, SOFT_FILL) : style === 'outline' ? page.card : color
    const background = style === 'gradient' ? gradient(color, end) : fill
    const defaultText = style === 'soft' ? readableTextOn(color, fill) : style === 'outline' ? text : getContrastColor(color)
    const isCustomized = colors.hero_color !== undefined || colors.hero_text !== undefined || style !== 'gradient'
    const rawText = colors.hero_text ?? defaultText
    // Text crosses the whole gradient: the end it reads worst on decides.
    const worstFill = style === 'gradient' ? worseFillFor(rawText, color, end) : fill
    const pair: ReadablePair = { text: 'hero_text', fill: worstFill, ownedBy: ['hero_color', 'hero_color_end'], minRatio: MIN_TEXT_CONTRAST }
    const heroText = floorText(rawText, pair, colors, style !== 'gradient')
    // Decorations were drawn in white; once the owner restyles the banner they follow its text.
    const ink = !isCustomized ? WHITE : style === 'gradient' || style === 'solid' ? heroText : color
    const cancelled = colors.cancelled_color ?? page.error
    return {
        heroBackground: background,
        heroBorder: style === 'outline' ? color : 'transparent',
        heroText,
        heroChip: setAlpha(ink, 0.2),
        heroChipSoft: setAlpha(ink, 0.15),
        heroDecor: setAlpha(ink, 0.1),
        heroTrack: setAlpha(ink, 0.25),
        heroBar: colors.hero_bar ?? ink,
        cancelledBackground: `linear-gradient(135deg, ${cancelled}, color-mix(in srgb, ${cancelled} 70%, black))`,
        cancelledText: colors.cancelled_color !== undefined ? getContrastColor(cancelled) : page.onAccent,
        heroIssue: issueFor(rawText, pair, colors, style !== 'gradient'),
        heroColor: color,
        heroColorEnd: end,
        cancelledColor: cancelled,
    }
}

function resolveLoyalty(page: Page, colors: Colors, options: TrackingOptions, text: string, muted: string) {
    const background = colors.loyalty_background ?? page.card
    const border = colors.loyalty_border ?? page.cardBorder
    const textPair: ReadablePair = { text: 'loyalty_text', fill: background, ownedBy: ['loyalty_background', 'card_background'], minRatio: MIN_TEXT_CONTRAST }
    const mutedPair: ReadablePair = { text: 'loyalty_muted_text', fill: background, ownedBy: ['loyalty_background', 'card_background'], minRatio: MIN_TEXT_CONTRAST }
    const rawText = colors.loyalty_text ?? text
    const rawMuted = colors.loyalty_muted_text ?? muted
    const loyaltyText = floorText(rawText, textPair, colors)
    const loyaltyMuted = floorText(rawMuted, mutedPair, colors)

    const inputBackground = colors.input_background ?? WHITE

    const band = colors.band_color ?? page.accent
    const bandEnd = colors.band_color_end ?? darkenColor(band, STRONG_SHADE)
    const style = options.band_style
    const bandFill = style === 'soft' ? mixHex(background, band, SOFT_FILL) : style === 'plain' ? background : band
    const defaultBandText = style === 'soft' ? readableTextOn(band, bandFill) : style === 'plain' ? loyaltyText : getContrastColor(band)
    const rawBandText = colors.band_text ?? defaultBandText
    const worstBandFill = style === 'gradient' ? worseFillFor(rawBandText, band, bandEnd) : bandFill
    const bandPair: ReadablePair = { text: 'band_text', fill: worstBandFill, ownedBy: ['band_color', 'band_color_end'], minRatio: MIN_TEXT_CONTRAST }
    const bandText = floorText(rawBandText, bandPair, colors, style !== 'gradient')
    const isBandCustomized = colors.band_color !== undefined || colors.band_text !== undefined || style !== 'gradient'

    const stamp = colors.stamp_color ?? page.accent
    const markPair: ReadablePair = { text: 'stamp_mark', fill: stamp, ownedBy: ['stamp_color'], minRatio: LARGE_TEXT_CONTRAST }
    const rawMark = colors.stamp_mark ?? getContrastColor(stamp)
    const stampBadge = colors.stamp_badge ?? stamp
    const stampReached = colors.stamp_reached ?? page.success
    const stampNext = colors.stamp_next ?? stamp

    const button = colors.loyalty_button ?? page.cta
    const buttonPair: ReadablePair = { text: 'loyalty_button_text', fill: button, ownedBy: ['loyalty_button'], minRatio: MIN_TEXT_CONTRAST }
    const rawButtonText = colors.loyalty_button_text ?? (colors.loyalty_button !== undefined ? getContrastColor(button) : page.onCta)

    return {
        palette: {
            loyaltyBackground: background,
            loyaltyBorder: border,
            loyaltyText,
            loyaltyMuted,
            loyaltyFaint: colors.loyalty_muted_text !== undefined ? loyaltyMuted : page.textFaint,
            inputBackground,
            // Typed digits must read on the number box (a light-text store once typed white on white).
            inputText: readableTextOn(loyaltyText, inputBackground),
            inputPlaceholder: colors.input_background !== undefined ? setAlpha(readableTextOn(loyaltyText, inputBackground), 0.4) : PLACEHOLDER_GREY,
            bandBackground: style === 'gradient' ? gradient(band, bandEnd) : bandFill,
            bandText,
            bandBorder: style === 'plain' ? border : 'transparent',
            bandChip: setAlpha(isBandCustomized ? bandText : WHITE, 0.2),
            bandColor: band,
            bandSoft: setAlpha(band, SOFT_ALPHA),
            bandInk: isBandCustomized ? bandText : WHITE,
            stamp,
            stampSoft: setAlpha(stamp, SOFT_ALPHA),
            stampTint: setAlpha(stamp, TINT_ALPHA),
            onStamp: floorText(rawMark, markPair, colors),
            stampEmpty: colors.stamp_empty ?? border,
            stampNext,
            stampNextTint: setAlpha(stampNext, TINT_ALPHA),
            stampBadge,
            onStampBadge: getContrastColor(stampBadge),
            stampReached,
            onStampReached: colors.stamp_reached !== undefined ? getContrastColor(stampReached) : getContrastColor(stampBadge),
            stampRadius: STAMP_RADII[options.stamp_shape],
            loyaltyButton: button,
            loyaltyButtonText: floorText(rawButtonText, buttonPair, colors),
            loyaltyLink: colors.loyalty_link ?? page.accent,
            walletBackground: colors.wallet_background ?? page.accentSoft,
        },
        settings: { band_color: band, band_color_end: bandEnd },
        issues: [
            issueFor(rawText, textPair, colors),
            issueFor(rawMuted, mutedPair, colors),
            issueFor(rawBandText, bandPair, colors, style !== 'gradient'),
            issueFor(rawMark, markPair, colors),
            issueFor(rawButtonText, buttonPair, colors),
        ],
    }
}

function resolveAll(branding: BrandingColors, trackingStyle: TrackingStyle): Resolved {
    const { colors, options } = trackingStyle
    const page = resolvePage(branding, colors, options)

    const textPair: ReadablePair = { text: 'text', fill: page.card, ownedBy: ['card_background'], minRatio: MIN_TEXT_CONTRAST }
    const mutedPair: ReadablePair = { text: 'muted_text', fill: page.card, ownedBy: ['card_background'], minRatio: MIN_TEXT_CONTRAST }
    const text = floorText(page.rawText, textPair, colors)
    const textMuted = floorText(page.rawMuted, mutedPair, colors)

    const headerBackground = colors.header_background ?? page.card
    const headerPair: ReadablePair = { text: 'header_text', fill: headerBackground, ownedBy: ['header_background'], minRatio: MIN_TEXT_CONTRAST }
    const rawHeaderText = colors.header_text ?? text
    const headerText = floorText(rawHeaderText, headerPair, colors)
    const live = colors.live_badge ?? page.accent

    const hero = resolveHero(page, colors, options, text)

    const ringBackground = colors.ring_background ?? page.card
    const ringPair: ReadablePair = { text: 'ring_text', fill: ringBackground, ownedBy: ['ring_background'], minRatio: MIN_TEXT_CONTRAST }
    const rawRingText = colors.ring_text ?? page.accent
    const ringArmed = colors.ring_armed ?? page.success

    const stepDone = colors.timeline_done ?? page.success
    const stepCurrent = colors.timeline_current ?? page.accent

    const totalPair: ReadablePair = { text: 'summary_total', fill: page.card, ownedBy: [], minRatio: LARGE_TEXT_CONTRAST }
    const rawTotal = colors.summary_total ?? page.accent
    const qty = colors.summary_badge ?? page.accent

    const pickupBackground = colors.pickup_background ?? page.card
    const pickupPair: ReadablePair = { text: 'pickup_text', fill: pickupBackground, ownedBy: ['pickup_background'], minRatio: MIN_TEXT_CONTRAST }
    const rawPickupText = colors.pickup_text ?? text
    const pickupReady = colors.pickup_ready ?? page.success

    const alertColor = colors.alert_background ?? hero.heroColor
    const alertEnd = darkenColor(alertColor, STRONG_SHADE)
    const alertPair: ReadablePair = { text: 'alert_text', fill: alertColor, ownedBy: ['alert_background', 'hero_color'], minRatio: MIN_TEXT_CONTRAST }
    const rawAlertText = colors.alert_text ?? getContrastColor(alertColor)
    const alertText = floorText(rawAlertText, alertPair, colors)
    const alertButton = colors.alert_button ?? alertText
    const alertButtonPair: ReadablePair = { text: 'alert_button_text', fill: alertButton, ownedBy: ['alert_button'], minRatio: MIN_TEXT_CONTRAST }
    const rawAlertButtonText = colors.alert_button_text ?? alertEnd

    const loyalty = resolveLoyalty(page, colors, options, text, textMuted)

    const palette: TrackingPalette = {
        background: page.background,
        glow: page.glow,
        card: page.card,
        cardBorder: page.cardBorder,
        text,
        textMuted,
        textFaint: page.textFaint,
        accent: page.accent,
        accentSoft: page.accentSoft,
        accentTint: page.accentTint,
        accentStrong: page.accentStrong,
        onAccent: page.onAccent,
        cta: page.cta,
        onCta: page.onCta,
        success: page.success,
        successSoft: page.successSoft,
        warning: page.warning,
        warningSoft: page.warningSoft,
        error: page.error,
        radius: page.radius,
        radiusInner: page.radiusInner,
        radiusPill: page.radiusPill,
        headerBackground: `color-mix(in srgb, ${headerBackground} 88%, transparent)`,
        headerText,
        headerMuted: colors.header_text !== undefined || colors.header_background !== undefined ? setAlpha(headerText, 0.72) : textMuted,
        live,
        liveSoft: setAlpha(live, SOFT_ALPHA),
        heroBackground: hero.heroBackground,
        heroBorder: hero.heroBorder,
        heroText: hero.heroText,
        heroChip: hero.heroChip,
        heroChipSoft: hero.heroChipSoft,
        heroDecor: hero.heroDecor,
        heroTrack: hero.heroTrack,
        heroBar: hero.heroBar,
        cancelledBackground: hero.cancelledBackground,
        cancelledText: hero.cancelledText,
        ringBackground,
        ringText: floorText(rawRingText, ringPair, colors),
        ringBorder: colors.ring_border ?? page.accent,
        ringArmed,
        ringArmedSoft: setAlpha(ringArmed, STATE_ALPHA),
        stepDone,
        onStepDone: colors.timeline_done !== undefined ? getContrastColor(stepDone) : WHITE,
        stepCurrent,
        onStepCurrent: getContrastColor(stepCurrent),
        stepCurrentSoft: setAlpha(stepCurrent, SOFT_ALPHA),
        stepUpcoming: colors.timeline_upcoming ?? page.cardBorder,
        total: floorText(rawTotal, totalPair, colors),
        qtyBackground: setAlpha(qty, SOFT_ALPHA),
        qtyText: qty,
        pickupBackground,
        pickupBorder: colors.pickup_border ?? page.cardBorder,
        pickupText: floorText(rawPickupText, pickupPair, colors),
        pickupMuted: colors.pickup_text !== undefined || colors.pickup_background !== undefined ? floorText(rawPickupText, pickupPair, colors) : textMuted,
        pickupReady,
        pickupReadyBackground: setAlpha(pickupReady, 0.08),
        alertBackground: gradient(alertColor, alertEnd),
        alertText,
        alertButton,
        alertButtonText: floorText(rawAlertButtonText, alertButtonPair, colors),
        ...loyalty.palette,
    }

    const issues = [
        issueFor(page.rawText, textPair, colors),
        issueFor(page.rawMuted, mutedPair, colors),
        issueFor(rawHeaderText, headerPair, colors),
        hero.heroIssue,
        issueFor(rawRingText, ringPair, colors),
        issueFor(rawTotal, totalPair, colors),
        issueFor(rawPickupText, pickupPair, colors),
        issueFor(rawAlertText, alertPair, colors),
        issueFor(rawAlertButtonText, alertButtonPair, colors),
        ...loyalty.issues,
    ].filter((issue): issue is TrackingContrastIssue => issue !== null)

    const settings: Record<TrackingColorKey, string> = {
        page_background: palette.background,
        page_glow_color: colors.page_glow_color ?? palette.accent,
        card_background: palette.card,
        card_border: palette.cardBorder,
        text: palette.text,
        muted_text: palette.textMuted,
        accent: palette.accent,
        header_background: headerBackground,
        header_text: palette.headerText,
        live_badge: palette.live,
        hero_color: hero.heroColor,
        hero_color_end: hero.heroColorEnd,
        hero_text: palette.heroText,
        hero_bar: palette.heroBar,
        cancelled_color: hero.cancelledColor,
        ring_background: palette.ringBackground,
        ring_text: palette.ringText,
        ring_border: palette.ringBorder,
        ring_armed: palette.ringArmed,
        timeline_done: palette.stepDone,
        timeline_current: palette.stepCurrent,
        timeline_upcoming: palette.stepUpcoming,
        summary_total: palette.total,
        summary_badge: palette.qtyText,
        pickup_background: palette.pickupBackground,
        pickup_border: palette.pickupBorder,
        pickup_text: palette.pickupText,
        pickup_ready: palette.pickupReady,
        alert_background: alertColor,
        alert_text: palette.alertText,
        alert_button: palette.alertButton,
        alert_button_text: palette.alertButtonText,
        loyalty_background: palette.loyaltyBackground,
        loyalty_border: palette.loyaltyBorder,
        loyalty_text: palette.loyaltyText,
        loyalty_muted_text: palette.loyaltyMuted,
        input_background: palette.inputBackground,
        band_color: loyalty.settings.band_color,
        band_color_end: loyalty.settings.band_color_end,
        band_text: palette.bandText,
        stamp_color: palette.stamp,
        stamp_mark: palette.onStamp,
        stamp_empty: palette.stampEmpty,
        stamp_next: palette.stampNext,
        stamp_badge: palette.stampBadge,
        stamp_reached: palette.stampReached,
        loyalty_button: palette.loyaltyButton,
        loyalty_button_text: palette.loyaltyButtonText,
        loyalty_link: palette.loyaltyLink,
        wallet_background: colors.wallet_background ?? palette.accent,
    }

    return { palette, issues, settings }
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
