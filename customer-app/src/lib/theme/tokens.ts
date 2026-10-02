import type { AppColors, AppCornerStyle, AppTheme } from '@/lib/contract'
import { FONT_PAIRS } from './fonts'

export const AA_CONTRAST = 4.5
const INK_DARK = '#111111'
const INK_LIGHT = '#FFFFFF'

function channel(value: number): number {
  const srgb = value / 255
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16)
  const r = channel((value >> 16) & 0xff)
  const g = channel((value >> 8) & 0xff)
  const b = channel(value & 0xff)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.x contrast ratio between two #RRGGBB colours. */
export function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

/** `preferred` when it reads on `background` at AA; otherwise the better of near-black / white. */
export function readableOn(background: string, preferred: string): string {
  if (contrastRatio(preferred, background) >= AA_CONTRAST) return preferred
  return contrastRatio(INK_DARK, background) >= contrastRatio(INK_LIGHT, background) ? INK_DARK : INK_LIGHT
}

const RADIUS: Record<AppCornerStyle, { sm: number; md: number; lg: number; xl: number }> = {
  sharp: { sm: 2, md: 4, lg: 6, xl: 8 },
  soft: { sm: 6, md: 10, lg: 14, xl: 20 },
  round: { sm: 10, md: 16, lg: 22, xl: 28 },
}

export const SPACE = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const

/** Belt and braces: the server derives legible pairs, but a phone never shows unreadable text. */
function safeColors(colors: AppColors): AppColors {
  return {
    ...colors,
    onPrimary: readableOn(colors.primary, colors.onPrimary),
    onPrimarySoft: readableOn(colors.primarySoft, colors.onPrimarySoft),
    onAccent: readableOn(colors.accent, colors.onAccent),
    text: readableOn(colors.background, colors.text),
  }
}

export function buildTokens(theme: AppTheme) {
  const fonts = FONT_PAIRS[theme.fontKey]
  const text = (fontFamily: string, fontSize: number, lineHeight: number, letterSpacing = 0) => ({
    fontFamily,
    fontSize,
    lineHeight,
    letterSpacing,
  })
  return {
    colors: safeColors(theme.colors),
    radius: { ...RADIUS[theme.corners], pill: 999 },
    space: SPACE,
    logoUrl: theme.logoUrl,
    type: {
      display: text(fonts.heading.heavy, 30, 36, -0.4),
      title: text(fonts.heading.bold, 22, 28, -0.2),
      headline: text(fonts.heading.bold, 17, 22),
      body: text(fonts.body.regular, 15, 21),
      bodyStrong: text(fonts.body.semibold, 15, 21),
      callout: text(fonts.body.medium, 14, 19),
      caption: text(fonts.body.medium, 12, 16),
      label: text(fonts.body.bold, 11, 14, 0.8),
      price: text(fonts.body.bold, 15, 20),
    },
    elevation: {
      card: { shadowColor: '#000000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
      raised: { shadowColor: '#000000', shadowOpacity: 0.14, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
    },
  }
}

export type Tokens = ReturnType<typeof buildTokens>
