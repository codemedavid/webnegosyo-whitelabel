import { z } from 'zod'

/**
 * Schemas for merchant-supplied values that are interpolated into CSS
 * (custom properties, inline styles, future `<style>` blocks).
 *
 * Rejects `<`, `>`, `"`, `'`, `;`, `{` and `}` — the characters that end a
 * declaration, a rule, a quoted string or the surrounding markup. Shared by the
 * tenant branding schema and the product-detail settings schema so both stores
 * hold the same line.
 */
export const CSS_INJECTION_CHARS = /[<>"';{}]/

const COLOR_MESSAGE = 'Color value contains invalid characters'
const CSS_VALUE_MESSAGE = 'Style value contains invalid characters'
const MAX_CSS_VALUE_LENGTH = 200

/**
 * A plausible CSS color: #hex, rgb()/rgba()/hsl()/hsla(), color-mix(), named
 * colors, keywords, or '' (unset).
 */
export function cssColorString() {
  return z.string().refine((value) => value === '' || !CSS_INJECTION_CHARS.test(value), { message: COLOR_MESSAGE })
}

/** A short CSS value such as `24px`, `700`, `180deg, #fff, #eee` or a font stack. */
export function cssValueString(max: number = MAX_CSS_VALUE_LENGTH) {
  return z
    .string()
    .max(max)
    .refine((value) => value === '' || !CSS_INJECTION_CHARS.test(value), { message: CSS_VALUE_MESSAGE })
}
