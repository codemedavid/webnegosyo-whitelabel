// ---------------------------------------------------------------------------
// Hero Block Designer v4 — Zod Validation Schemas
// ---------------------------------------------------------------------------

import { z } from 'zod'

// ── CSS Injection Guard Helpers (internal) ──────────────────────────────────

/** Rejects strings containing characters that could enable CSS/HTML injection */
function cssColorString() {
  return z
    .string()
    .max(100)
    .refine((v) => !/[<>"';{}]/.test(v), {
      message: 'Invalid characters in color value',
    })
}

/** Rejects strings containing angle brackets */
function safeString(maxLen: number) {
  return z
    .string()
    .max(maxLen)
    .refine((v) => !/[<>]/.test(v), { message: 'Invalid characters' })
}

/** URL string or empty string */
function safeUrl() {
  return z
    .string()
    .max(2000)
    .url()
    .or(z.literal(''))
}

// ── Primitive Schemas ───────────────────────────────────────────────────────

export const spacingSchema = z.object({
  top: z.number().min(0).max(500),
  right: z.number().min(0).max(500),
  bottom: z.number().min(0).max(500),
  left: z.number().min(0).max(500),
})

export const marginSchema = z.object({
  top: z.number().min(0).max(500),
  bottom: z.number().min(0).max(500),
})

export const visibilitySchema = z.object({
  desktop: z.boolean(),
  tablet: z.boolean(),
  mobile: z.boolean(),
})

export const animationTypeSchema = z.enum([
  'fadeIn',
  'slideUp',
  'slideDown',
  'slideLeft',
  'slideRight',
  'scaleIn',
  'bounce',
  'none',
])

export const animationSchema = z.object({
  type: animationTypeSchema,
  duration: z.number().min(0).max(10000),
  delay: z.number().min(0).max(10000),
})

// ── Widget Props Schemas (discriminated union on `kind`) ────────────────────

export const textPropsSchema = z.object({
  kind: z.literal('text'),
  content: safeString(5000),
  fontFamily: safeString(200),
  fontSize: z.number().min(8).max(200),
  fontWeight: z.number().min(100).max(900),
  lineHeight: z.number().min(0.5).max(5),
  letterSpacing: z.number().min(-10).max(50),
  color: cssColorString(),
  textAlign: z.enum(['left', 'center', 'right']),
  textShadow: safeString(200),
  bold: z.boolean(),
  italic: z.boolean(),
  underline: z.boolean(),
})

export const imagePropsSchema = z.object({
  kind: z.literal('image'),
  src: safeUrl(),
  alt: safeString(500),
  objectFit: z.enum(['cover', 'contain', 'fill']),
  borderRadius: z.number().min(0).max(500),
  opacity: z.number().min(0).max(1),
  width: z.number().min(1).max(4000).optional(),
  height: z.number().min(1).max(4000).optional(),
})

export const buttonPropsSchema = z.object({
  kind: z.literal('button'),
  text: safeString(500),
  linkUrl: safeUrl(),
  linkTarget: z.enum(['_blank', '_self']),
  backgroundColor: cssColorString(),
  textColor: cssColorString(),
  borderWidth: z.number().min(0).max(20),
  borderColor: cssColorString(),
  borderRadius: z.number().min(0).max(500),
  hoverEffect: z.enum(['darken', 'lighten', 'scale', 'none']),
  fontSize: z.number().min(8).max(200),
  fontWeight: z.number().min(100).max(900),
})

export const shapePropsSchema = z.object({
  kind: z.literal('shape'),
  shapeType: z.enum(['rectangle', 'circle', 'rounded-rect']),
  fillColor: cssColorString(),
  borderWidth: z.number().min(0).max(20),
  borderColor: cssColorString(),
  borderRadius: z.number().min(0).max(500),
  opacity: z.number().min(0).max(1),
})

export const dividerPropsSchema = z.object({
  kind: z.literal('divider'),
  orientation: z.enum(['horizontal', 'vertical']),
  thickness: z.number().min(1).max(50),
  color: cssColorString(),
  style: z.enum(['solid', 'dashed', 'dotted']),
})

export const spacerPropsSchema = z.object({
  kind: z.literal('spacer'),
  height: z.number().min(0).max(500),
})

export const iconPropsSchema = z.object({
  kind: z.literal('icon'),
  iconName: safeString(100),
  size: z.number().min(8).max(512),
  color: cssColorString(),
})

export const videoPropsSchema = z.object({
  kind: z.literal('video'),
  videoUrl: safeUrl(),
  autoplay: z.boolean(),
  muted: z.boolean(),
  loop: z.boolean(),
  posterImage: safeUrl(),
})

export const countdownPropsSchema = z.object({
  kind: z.literal('countdown'),
  targetDate: safeString(100),
  showDays: z.boolean(),
  showHours: z.boolean(),
  showMinutes: z.boolean(),
  showSeconds: z.boolean(),
  fontSize: z.number().min(8).max(200),
  color: cssColorString(),
  separatorColor: cssColorString(),
})

export const socialProofPropsSchema = z.object({
  kind: z.literal('social-proof'),
  presetType: z.enum(['orders', 'merchants', 'custom']),
  text: safeString(500),
  number: z.number().min(0).max(99999999),
  iconName: safeString(100),
  badgeStyle: z.enum(['pill', 'rounded', 'square']),
  backgroundColor: cssColorString(),
  textColor: cssColorString(),
})

export const animatedBgPropsSchema = z.object({
  kind: z.literal('animated-bg'),
  gradientType: z.enum(['linear', 'radial', 'none']),
  gradientColors: z.array(cssColorString()).max(10),
  gradientAngle: z.number().min(0).max(360),
  patternType: z.enum(['dots', 'lines', 'grid', 'none']),
  patternOpacity: z.number().min(0).max(1),
  parallax: z.boolean(),
})

/** Discriminated union of every widget's props */
export const widgetPropsSchema = z.discriminatedUnion('kind', [
  textPropsSchema,
  imagePropsSchema,
  buttonPropsSchema,
  shapePropsSchema,
  dividerPropsSchema,
  spacerPropsSchema,
  iconPropsSchema,
  videoPropsSchema,
  countdownPropsSchema,
  socialProofPropsSchema,
  animatedBgPropsSchema,
])

// ── Block Background Schema (columns & widgets) ────────────────────────────

export const blockBackgroundSchema = z.object({
  type: z.enum(['none', 'color', 'image', 'gradient']),
  color: cssColorString().optional(),
  image: z.object({
    url: safeUrl(),
    opacity: z.number().min(0).max(1),
    objectFit: z.enum(['cover', 'contain', 'fill']),
  }).optional(),
  gradient: safeString(500).optional(),
})

// ── Widget Overrides Schema ─────────────────────────────────────────────────

/** Partial widget props for responsive overrides — validated as a record since
 *  Zod discriminatedUnion doesn't support .partial(). The full props are
 *  validated at the widget level; overrides only need structural safety. */
const partialWidgetPropsSchema = z.record(z.string(), z.unknown()).optional()

export const widgetOverridesSchema = z.object({
  alignment: z.enum(['left', 'center', 'right']).optional(),
  width: z.string().optional(),
  margin: marginSchema.optional(),
  padding: spacingSchema.optional(),
  props: partialWidgetPropsSchema,
})

// ── Widget Schema ───────────────────────────────────────────────────────────

const blockWidgetTypeSchema = z.enum([
  'text',
  'image',
  'button',
  'shape',
  'divider',
  'spacer',
  'icon',
  'video',
  'countdown',
  'social-proof',
  'animated-bg',
])

const widthSchema = z.union([
  z.literal('auto'),
  z.literal('full'),
  z.string().refine(
    (v) => {
      const num = Number(v)
      return !isNaN(num) && num >= 1 && num <= 100
    },
    { message: 'Width must be "auto", "full", or a number string between 1 and 100' },
  ),
])

const breakpointOverridesSchema = z
  .object({
    desktop: widgetOverridesSchema.optional(),
    tablet: widgetOverridesSchema.optional(),
    mobile: widgetOverridesSchema.optional(),
  })
  .partial()
  .optional()

export const widgetSchema = z.object({
  id: z.string().uuid(),
  type: blockWidgetTypeSchema,
  label: safeString(100),
  alignment: z.enum(['left', 'center', 'right']),
  width: widthSchema,
  margin: marginSchema,
  padding: spacingSchema,
  background: blockBackgroundSchema.optional().default({ type: 'none' }),
  props: widgetPropsSchema,
  animation: animationSchema,
  visibility: visibilitySchema,
  responsiveOverrides: breakpointOverridesSchema,
})

// ── Column Schema ───────────────────────────────────────────────────────────

export const columnSettingsSchema = z.object({
  verticalAlign: z.enum(['top', 'center', 'bottom']),
  horizontalAlign: z.enum(['left', 'center', 'right']),
  padding: spacingSchema,
  background: z.union([blockBackgroundSchema, z.string()]).transform((val) =>
    typeof val === 'string' ? { type: 'none' as const } : val
  ).default({ type: 'none' }),
  borderRadius: z.number().min(0).max(500),
})

const columnOverridesSchema = z
  .object({
    desktop: columnSettingsSchema.partial().optional(),
    tablet: columnSettingsSchema.partial().optional(),
    mobile: columnSettingsSchema.partial().optional(),
  })
  .partial()
  .optional()

export const columnSchema = z.object({
  id: z.string().uuid(),
  width: z.number().min(1).max(100),
  widgets: z.array(widgetSchema).max(20),
  settings: columnSettingsSchema,
  responsiveOverrides: columnOverridesSchema,
})

// ── Section Schema ──────────────────────────────────────────────────────────

export const sectionBackgroundSchema = z.object({
  type: z.enum(['color', 'image', 'gradient', 'video']),
  color: cssColorString().optional(),
  image: safeUrl().optional(),
  gradient: safeString(500).optional(),
  video: safeUrl().optional(),
})

export const sectionSettingsSchema = z.object({
  contentWidth: z.number().min(0).max(2560),
  horizontalAlign: z.enum(['left', 'center', 'right']),
  minHeight: z.number().min(0).max(2000),
  background: sectionBackgroundSchema,
  padding: spacingSchema,
  margin: marginSchema,
})

const sectionOverridesSchema = z
  .object({
    desktop: sectionSettingsSchema.partial().optional(),
    tablet: sectionSettingsSchema.partial().optional(),
    mobile: sectionSettingsSchema.partial().optional(),
  })
  .partial()
  .optional()

export const sectionSchema = z.object({
  id: z.string().uuid(),
  label: safeString(100),
  columns: z.array(columnSchema).min(1).max(6),
  settings: sectionSettingsSchema,
  responsiveOverrides: sectionOverridesSchema,
})

// ── Top-level ───────────────────────────────────────────────────────────────

export const globalStylesSchema = z.object({
  backgroundColor: cssColorString(),
  backgroundImage: safeUrl().optional(),
  maxWidth: z.number().min(320).max(2560),
})

export const heroBlockDesignSchema = z.object({
  version: z.literal(4),
  sections: z.array(sectionSchema).max(10),
  globalStyles: globalStylesSchema,
})

/** Inferred type from the top-level schema */
export type ValidatedHeroBlockDesign = z.infer<typeof heroBlockDesignSchema>
