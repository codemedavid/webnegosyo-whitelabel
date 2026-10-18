/**
 * WCAG 2.x contrast helpers. Pure, so storefront Server Components, the
 * product page theme and the Branding Studio can all share them.
 */

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const DARK_INK = '#111111'
const LIGHT_INK = '#ffffff'

/** WCAG AA for body text. */
export const MIN_TEXT_CONTRAST = 4.5

function channels(hex: string): number[] {
    const digits = hex.length === 4
        ? hex.slice(1).split('').map((c) => c + c).join('')
        : hex.slice(1)
    return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16) / 255)
}

function relativeLuminance(hex: string): number {
    const [r, g, b] = channels(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Contrast ratio (1–21) of two hex colours, or null when either can't be measured. */
export function contrastRatio(a: string, b: string): number | null {
    if (!HEX_PATTERN.test(a) || !HEX_PATTERN.test(b)) return null
    const [high, low] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
    return (high + 0.05) / (low + 0.05)
}

/**
 * `text` when it reads on `background` at `minRatio`, else the more readable
 * of dark or light ink. Colours that can't be measured are left alone.
 */
export function readableTextOn(text: string, background: string, minRatio = MIN_TEXT_CONTRAST): string {
    const ratio = contrastRatio(text, background)
    if (ratio === null || ratio >= minRatio) return text
    const dark = contrastRatio(DARK_INK, background) ?? 0
    const light = contrastRatio(LIGHT_INK, background) ?? 0
    return dark >= light ? DARK_INK : LIGHT_INK
}
