import { z } from 'zod'
import { hexColorSchema, httpsUrlSchema } from './primitives'

/** Font families bundled into every build; a tenant picks one by key. */
export const APP_FONT_KEYS = ['jakarta', 'inter', 'poppins', 'nunito', 'fraunces'] as const
export type AppFontKey = (typeof APP_FONT_KEYS)[number]

export const APP_CORNER_STYLES = ['sharp', 'soft', 'round'] as const
export type AppCornerStyle = (typeof APP_CORNER_STYLES)[number]

/**
 * Finished colour roles. The server derives these from the tenant's branding
 * (with contrast-safe `on*` pairs) so the app never computes brand colours.
 */
export const appColorsSchema = z.object({
  primary: hexColorSchema,
  onPrimary: hexColorSchema,
  primarySoft: hexColorSchema,
  onPrimarySoft: hexColorSchema,
  accent: hexColorSchema,
  onAccent: hexColorSchema,
  background: hexColorSchema,
  surface: hexColorSchema,
  surfaceMuted: hexColorSchema,
  text: hexColorSchema,
  textMuted: hexColorSchema,
  border: hexColorSchema,
  success: hexColorSchema,
  warning: hexColorSchema,
  danger: hexColorSchema,
})

export type AppColors = z.infer<typeof appColorsSchema>

export const appThemeSchema = z.object({
  colors: appColorsSchema,
  fontKey: z.enum(APP_FONT_KEYS),
  corners: z.enum(APP_CORNER_STYLES),
  logoUrl: httpsUrlSchema.nullable(),
})

export type AppTheme = z.infer<typeof appThemeSchema>
