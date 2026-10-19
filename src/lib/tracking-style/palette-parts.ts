/**
 * One resolver per part of the order page / loyalty card. Each returns its
 * slice of the palette, the colour each of its settings comes to (what the
 * Studio shows beside a blank setting) and its readability issues. See
 * palette.ts for the rules every part follows.
 */

import { darkenColor, getContrastColor, setAlpha, type BrandingColors } from '@/lib/branding-utils'
import { contrastRatio, mixHex, MIN_TEXT_CONTRAST, readableTextOn } from '@/lib/color-contrast'
import type { TrackingColorKey, TrackingOptions, TrackingStyle } from '@/lib/tracking-style/keys'
import type { TrackingContrastIssue, TrackingPalette } from '@/lib/tracking-style/palette'

/** WCAG minimum for large text and icons. */
const LARGE_TEXT_CONTRAST = 3
const STRONG_SHADE = 0.18
const SOFT_ALPHA = 0.12
const TINT_ALPHA = 0.06
const STATE_ALPHA = 0.14
/** How much of the colour a "soft" banner or band mixes into the card. */
const SOFT_FILL = 0.14
/** The cancelled banner's gradient ends at 70% colour, 30% black. */
const CANCELLED_SHADE = 0.3
const WHITE = '#ffffff'
const BLACK = '#000000'
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

type Colors = TrackingStyle['colors']

export interface Part {
    palette: Partial<TrackingPalette>
    settings: Partial<Record<TrackingColorKey, string>>
    issues: readonly (TrackingContrastIssue | null)[]
}

const gradient = (from: string, to: string) => `linear-gradient(135deg, ${from}, ${to})`

/** The gradient end `text` reads worst on. */
function worseFillFor(text: string, from: string, to: string): string {
    return (contrastRatio(text, to) ?? Infinity) < (contrastRatio(text, from) ?? Infinity) ? to : from
}

/** White or black, whichever reads better across the whole of a gradient. */
function inkAcross(from: string, to: string): string {
    const worst = (ink: string) => Math.min(contrastRatio(ink, from) ?? 0, contrastRatio(ink, to) ?? 0)
    return worst(WHITE) >= worst(BLACK) ? WHITE : BLACK
}

interface ReadablePair {
    text: TrackingColorKey
    /** The colour the text sits on (already resolved). */
    fill: string
    /** Settings that, when the owner set one, put this pair under the floor. */
    ownedBy: readonly TrackingColorKey[]
    minRatio: number
}

function isOwned(pair: ReadablePair, colors: Colors, extraOwned: boolean): boolean {
    return extraOwned || colors[pair.text] !== undefined || pair.ownedBy.some((key) => colors[key] !== undefined)
}

/** The text customers see (readable floor where the owner changed a side) and its issue, if any. */
function readable(text: string, pair: ReadablePair, colors: Colors, extraOwned = false): { text: string; issue: TrackingContrastIssue | null } {
    if (!isOwned(pair, colors, extraOwned)) return { text, issue: null }
    const fixed = readableTextOn(text, pair.fill, pair.minRatio)
    const ratio = contrastRatio(text, pair.fill)
    const issue = ratio !== null && ratio < pair.minRatio ? { key: pair.text, ratio, minRatio: pair.minRatio, fix: fixed } : null
    return { text: fixed, issue }
}

const pairOf = (text: TrackingColorKey, fill: string, ownedBy: readonly TrackingColorKey[], minRatio = MIN_TEXT_CONTRAST): ReadablePair =>
    ({ text, fill, ownedBy, minRatio })

/** The page's own colours: background, cards, text, accent, corners. */
export function resolvePage(branding: BrandingColors, colors: Colors, options: TrackingOptions) {
    const accent = colors.accent ?? branding.primary
    const card = colors.card_background ?? branding.cards
    const radius = RADII[options.corners]
    const text = readable(colors.text ?? branding.textPrimary, pairOf('text', card, ['card_background']), colors)
    const muted = readable(colors.muted_text ?? branding.textSecondary, pairOf('muted_text', card, ['card_background']), colors)
    const palette = {
        background: colors.page_background ?? branding.background,
        glow: options.show_glow ? setAlpha(colors.page_glow_color ?? accent, SOFT_ALPHA) : 'transparent',
        card,
        cardBorder: colors.card_border ?? branding.cardsBorder,
        text: text.text,
        textMuted: muted.text,
        // The faintest text follows the owner's soft text (kept readable) once set.
        textFaint: colors.muted_text !== undefined ? muted.text : branding.textMuted,
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
    const settings = {
        page_background: palette.background,
        page_glow_color: colors.page_glow_color ?? accent,
        card_background: card,
        card_border: palette.cardBorder,
        text: palette.text,
        muted_text: palette.textMuted,
        accent,
    }
    return { palette, settings, issues: [text.issue, muted.issue] }
}

export type Page = ReturnType<typeof resolvePage>['palette']

export function resolveHeader(page: Page, colors: Colors): Part {
    const background = colors.header_background ?? page.card
    const text = readable(colors.header_text ?? page.text, pairOf('header_text', background, ['header_background']), colors)
    const live = colors.live_badge ?? page.accent
    const isCustomized = colors.header_text !== undefined || colors.header_background !== undefined
    return {
        palette: {
            headerBackground: `color-mix(in srgb, ${background} 88%, transparent)`,
            headerText: text.text,
            headerMuted: isCustomized ? setAlpha(text.text, 0.72) : page.textMuted,
            live,
            liveSoft: setAlpha(live, SOFT_ALPHA),
        },
        settings: { header_background: background, header_text: text.text, live_badge: live },
        issues: [text.issue],
    }
}

export function resolveHero(page: Page, colors: Colors, options: TrackingOptions): Part {
    const color = colors.hero_color ?? page.accent
    const end = colors.hero_color_end ?? darkenColor(color, STRONG_SHADE)
    const style = options.hero_style
    const fill = style === 'soft' ? mixHex(page.card, color, SOFT_FILL) : style === 'outline' ? page.card : color
    const defaultText = style === 'soft' ? readableTextOn(color, fill) : style === 'outline' ? page.text : getContrastColor(color)
    const rawText = colors.hero_text ?? defaultText
    // Text crosses the whole gradient: the end it reads worst on decides.
    const worstFill = style === 'gradient' ? worseFillFor(rawText, color, end) : fill
    const text = readable(rawText, pairOf('hero_text', worstFill, ['hero_color', 'hero_color_end']), colors, style !== 'gradient')
    const isCustomized = colors.hero_color !== undefined || colors.hero_text !== undefined || style !== 'gradient'
    // Decorations were drawn in white; once the owner restyles the banner they follow its text.
    const ink = !isCustomized ? WHITE : style === 'gradient' || style === 'solid' ? text.text : color
    return {
        palette: {
            heroBackground: style === 'gradient' ? gradient(color, end) : fill,
            heroBorder: style === 'outline' ? color : 'transparent',
            heroText: text.text,
            heroChip: setAlpha(ink, 0.2),
            heroChipSoft: setAlpha(ink, 0.15),
            heroDecor: setAlpha(ink, 0.1),
            heroTrack: setAlpha(ink, 0.25),
            heroBar: colors.hero_bar ?? ink,
            ...resolveCancelled(page, colors),
        },
        settings: { hero_color: color, hero_color_end: end, hero_text: text.text, hero_bar: colors.hero_bar ?? ink, cancelled_color: colors.cancelled_color ?? page.error },
        issues: [text.issue],
    }
}

function resolveCancelled(page: Page, colors: Colors): Pick<TrackingPalette, 'cancelledBackground' | 'cancelledText'> {
    const cancelled = colors.cancelled_color ?? page.error
    // Untouched stores keep the old ink; once the owner changes the accent or this colour, the text follows the red itself.
    const isCustomized = colors.cancelled_color !== undefined || colors.accent !== undefined
    const end = mixHex(cancelled, BLACK, CANCELLED_SHADE)
    return {
        cancelledBackground: `linear-gradient(135deg, ${cancelled}, color-mix(in srgb, ${cancelled} 70%, black))`,
        cancelledText: isCustomized ? inkAcross(cancelled, end) : page.onAccent,
    }
}

export function resolveRing(page: Page, colors: Colors): Part {
    const background = colors.ring_background ?? page.card
    const text = readable(colors.ring_text ?? page.accent, pairOf('ring_text', background, ['ring_background']), colors)
    const armed = colors.ring_armed ?? page.success
    const border = colors.ring_border ?? page.accent
    return {
        palette: { ringBackground: background, ringText: text.text, ringBorder: border, ringArmed: armed, ringArmedSoft: setAlpha(armed, STATE_ALPHA) },
        settings: { ring_background: background, ring_text: text.text, ring_border: border, ring_armed: armed },
        issues: [text.issue],
    }
}

export function resolveTimelineAndSummary(page: Page, colors: Colors): Part {
    const done = colors.timeline_done ?? page.success
    const current = colors.timeline_current ?? page.accent
    const upcoming = colors.timeline_upcoming ?? page.cardBorder
    const total = readable(colors.summary_total ?? page.accent, pairOf('summary_total', page.card, [], LARGE_TEXT_CONTRAST), colors)
    const qty = colors.summary_badge ?? page.accent
    return {
        palette: {
            stepDone: done,
            onStepDone: colors.timeline_done !== undefined ? getContrastColor(done) : WHITE,
            stepCurrent: current,
            onStepCurrent: getContrastColor(current),
            stepCurrentSoft: setAlpha(current, SOFT_ALPHA),
            stepUpcoming: upcoming,
            total: total.text,
            qtyBackground: setAlpha(qty, SOFT_ALPHA),
            qtyText: qty,
        },
        settings: { timeline_done: done, timeline_current: current, timeline_upcoming: upcoming, summary_total: total.text, summary_badge: qty },
        issues: [total.issue],
    }
}

export function resolvePickup(page: Page, colors: Colors): Part {
    const background = colors.pickup_background ?? page.card
    const text = readable(colors.pickup_text ?? page.text, pairOf('pickup_text', background, ['pickup_background']), colors)
    const ready = colors.pickup_ready ?? page.success
    const border = colors.pickup_border ?? page.cardBorder
    const isCustomized = colors.pickup_text !== undefined || colors.pickup_background !== undefined
    return {
        palette: {
            pickupBackground: background,
            pickupBorder: border,
            pickupText: text.text,
            pickupMuted: isCustomized ? text.text : page.textMuted,
            pickupReady: ready,
            pickupReadyBackground: setAlpha(ready, 0.08),
        },
        settings: { pickup_background: background, pickup_border: border, pickup_text: text.text, pickup_ready: ready },
        issues: [text.issue],
    }
}

export function resolveAlert(colors: Colors, heroColor: string): Part {
    const background = colors.alert_background ?? heroColor
    const end = darkenColor(background, STRONG_SHADE)
    const text = readable(colors.alert_text ?? getContrastColor(background), pairOf('alert_text', background, ['alert_background', 'hero_color']), colors)
    const button = colors.alert_button ?? text.text
    const buttonText = readable(colors.alert_button_text ?? end, pairOf('alert_button_text', button, ['alert_button']), colors)
    return {
        palette: { alertBackground: gradient(background, end), alertText: text.text, alertButton: button, alertButtonText: buttonText.text },
        settings: { alert_background: background, alert_text: text.text, alert_button: button, alert_button_text: buttonText.text },
        issues: [text.issue, buttonText.issue],
    }
}

export function resolveLoyaltyCard(page: Page, colors: Colors): Part & { palette: Pick<TrackingPalette, 'loyaltyBackground' | 'loyaltyBorder' | 'loyaltyText' | 'loyaltyMuted'> } {
    const background = colors.loyalty_background ?? page.card
    const border = colors.loyalty_border ?? page.cardBorder
    const owners: TrackingColorKey[] = ['loyalty_background', 'card_background']
    const text = readable(colors.loyalty_text ?? page.text, pairOf('loyalty_text', background, owners), colors)
    const muted = readable(colors.loyalty_muted_text ?? page.textMuted, pairOf('loyalty_muted_text', background, owners), colors)
    const input = colors.input_background ?? WHITE
    // Typed digits must read on the number box (a light-text store once typed white on white).
    const inputText = readableTextOn(text.text, input)
    return {
        palette: {
            loyaltyBackground: background,
            loyaltyBorder: border,
            loyaltyText: text.text,
            loyaltyMuted: muted.text,
            loyaltyFaint: colors.loyalty_muted_text !== undefined ? muted.text : page.textFaint,
            inputBackground: input,
            inputText,
            inputPlaceholder: colors.input_background !== undefined ? setAlpha(inputText, 0.4) : PLACEHOLDER_GREY,
        },
        settings: { loyalty_background: background, loyalty_border: border, loyalty_text: text.text, loyalty_muted_text: muted.text, input_background: input },
        issues: [text.issue, muted.issue],
    }
}

type Card = ReturnType<typeof resolveLoyaltyCard>['palette']

export function resolveBand(page: Page, card: Card, colors: Colors, options: TrackingOptions): Part {
    const band = colors.band_color ?? page.accent
    const end = colors.band_color_end ?? darkenColor(band, STRONG_SHADE)
    const style = options.band_style
    const fill = style === 'soft' ? mixHex(card.loyaltyBackground, band, SOFT_FILL) : style === 'plain' ? card.loyaltyBackground : band
    const defaultText = style === 'soft' ? readableTextOn(band, fill) : style === 'plain' ? card.loyaltyText : getContrastColor(band)
    const rawText = colors.band_text ?? defaultText
    const worstFill = style === 'gradient' ? worseFillFor(rawText, band, end) : fill
    const text = readable(rawText, pairOf('band_text', worstFill, ['band_color', 'band_color_end']), colors, style !== 'gradient')
    const isCustomized = colors.band_color !== undefined || colors.band_text !== undefined || style !== 'gradient'
    const ink = isCustomized ? text.text : WHITE
    return {
        palette: {
            bandBackground: style === 'gradient' ? gradient(band, end) : fill,
            bandText: text.text,
            bandBorder: style === 'plain' ? card.loyaltyBorder : 'transparent',
            bandChip: setAlpha(ink, 0.2),
            bandSoft: setAlpha(band, SOFT_ALPHA),
            // The small band on the checkout panel: the band colour on its own tint, kept readable once set.
            bandSoftText: colors.band_color !== undefined ? readableTextOn(band, mixHex(card.loyaltyBackground, band, SOFT_ALPHA)) : band,
            bandInk: ink,
        },
        settings: { band_color: band, band_color_end: end, band_text: text.text },
        issues: [text.issue],
    }
}

export function resolveStampsAndButtons(page: Page, card: Card, colors: Colors, options: TrackingOptions): Part {
    const stamp = colors.stamp_color ?? page.accent
    const mark = readable(colors.stamp_mark ?? getContrastColor(stamp), pairOf('stamp_mark', stamp, ['stamp_color'], LARGE_TEXT_CONTRAST), colors)
    const badge = colors.stamp_badge ?? stamp
    const reached = colors.stamp_reached ?? page.success
    const next = colors.stamp_next ?? stamp
    const empty = colors.stamp_empty ?? card.loyaltyBorder
    const button = colors.loyalty_button ?? page.cta
    const buttonText = readable(
        colors.loyalty_button_text ?? (colors.loyalty_button !== undefined ? getContrastColor(button) : page.onCta),
        pairOf('loyalty_button_text', button, ['loyalty_button']),
        colors
    )
    const link = colors.loyalty_link ?? page.accent
    const wallet = colors.wallet_background
    return {
        palette: {
            stamp,
            stampSoft: setAlpha(stamp, SOFT_ALPHA),
            stampTint: setAlpha(stamp, TINT_ALPHA),
            onStamp: mark.text,
            stampEmpty: empty,
            stampNext: next,
            stampNextTint: setAlpha(next, TINT_ALPHA),
            stampBadge: badge,
            onStampBadge: getContrastColor(badge),
            stampReached: reached,
            onStampReached: getContrastColor(colors.stamp_reached !== undefined ? reached : badge),
            stampRadius: STAMP_RADII[options.stamp_shape],
            loyaltyButton: button,
            loyaltyButtonText: buttonText.text,
            loyaltyLink: link,
            // Blank = the accent's light tint over the card (as before); the owner's pick is painted as chosen.
            walletBackground: wallet ?? page.accentSoft,
            walletText: wallet ? readableTextOn(card.loyaltyText, wallet) : card.loyaltyText,
            walletMuted: wallet ? readableTextOn(card.loyaltyMuted, wallet) : card.loyaltyMuted,
        },
        settings: {
            stamp_color: stamp, stamp_mark: mark.text, stamp_empty: empty, stamp_next: next, stamp_badge: badge, stamp_reached: reached,
            loyalty_button: button, loyalty_button_text: buttonText.text, loyalty_link: link,
            wallet_background: wallet ?? mixHex(card.loyaltyBackground, page.accent, SOFT_ALPHA),
        },
        issues: [mark.issue, buttonText.issue],
    }
}
