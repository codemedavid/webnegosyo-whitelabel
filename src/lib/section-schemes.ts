/**
 * Colour styles per storefront section (brand editor v2, Phase 4): the owner
 * picks Light / Tinted / Brand / Dark for a section instead of setting its
 * colours one by one; text colours are worked out to stay readable. Stored in
 * `tenants.section_schemes` ({ header: 'brand' }). A section without a style
 * keeps its own colour settings ("auto").
 */

import { z } from 'zod'
import { readableTextOn } from '@/lib/color-contrast'

export const SECTION_SCHEME_IDS = ['auto', 'light', 'tinted', 'brand', 'dark'] as const
export type SectionScheme = (typeof SECTION_SCHEME_IDS)[number]

export const STYLED_SECTIONS = ['header', 'hero'] as const
export type StyledSection = (typeof STYLED_SECTIONS)[number]

export const sectionSchemesSchema = z.object({
    header: z.enum(SECTION_SCHEME_IDS).optional(),
    hero: z.enum(SECTION_SCHEME_IDS).optional(),
}).strict()

export interface SchemeColors {
    background: string
    text: string
    muted: string
}

const LIGHT = '#ffffff'
const DARK = '#141414'
const TINT_PERCENT = 0.12
const HEX = /^#([0-9a-f]{6})$/i

function tint(color: string, amount: number): string {
    if (!HEX.test(color)) return LIGHT
    const value = parseInt(color.slice(1), 16)
    const channel = (shift: number) => {
        const c = (value >> shift) & 255
        return Math.round(255 + (c - 255) * amount).toString(16).padStart(2, '0')
    }
    return `#${channel(16)}${channel(8)}${channel(0)}`
}

/** The colours a style gives a section, from the store's brand colour. */
export function schemeColors(scheme: Exclude<SectionScheme, 'auto'>, brand: string): SchemeColors {
    const background = scheme === 'light' ? LIGHT
        : scheme === 'dark' ? DARK
            : scheme === 'tinted' ? tint(brand, TINT_PERCENT)
                : HEX.test(brand) ? brand : DARK
    const text = readableTextOn(background === DARK || scheme === 'brand' ? '#ffffff' : '#1a1a1a', background)
    const muted = readableTextOn(text === '#ffffff' ? '#d4d4d4' : '#525252', background)
    return { background, text, muted }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The style picked for a section, or null for "auto" / anything unknown. Untrusted input. */
export function readSectionScheme(tenant: Record<string, unknown> | null | undefined, section: StyledSection): Exclude<SectionScheme, 'auto'> | null {
    const raw = tenant?.section_schemes
    const value = isPlainObject(raw) ? raw[section] : undefined
    return typeof value === 'string' && value !== 'auto' && (SECTION_SCHEME_IDS as readonly string[]).includes(value)
        ? (value as Exclude<SectionScheme, 'auto'>)
        : null
}
