// ---------------------------------------------------------------------------
// Hero Section Designer — Zod validation schemas
// ---------------------------------------------------------------------------
// Mirrors src/types/hero-designer.ts. CSS color fields use the same injection
// guard as src/app/actions/branding.ts (reject < > " ' ; { }).
// ---------------------------------------------------------------------------

import { z } from 'zod'

// ── CSS injection guard (same pattern as branding.ts) ───────────────────────

const CSS_INJECTION_CHARS = /[<>"';{}]/

function cssColorString() {
  return z.string().refine(
    (val) => val === '' || !CSS_INJECTION_CHARS.test(val),
    { message: 'Color value contains invalid characters' }
  )
}

// ── Primitives ──────────────────────────────────────────────────────────────

const spacingSchema = z.object({
  top: z.number().min(0).max(500),
  right: z.number().min(0).max(500),
  bottom: z.number().min(0).max(500),
  left: z.number().min(0).max(500),
})

const elementLayoutSchema = z.object({
  x: z.number().min(-100).max(200),
  y: z.number().min(-100).max(200),
  width: z.number().min(-1).max(200),
  height: z.number().min(-1).max(200),
  rotation: z.number().min(-360).max(360),
  padding: spacingSchema,
  margin: spacingSchema,
})

// ── Animation ───────────────────────────────────────────────────────────────

const animationTypeSchema = z.enum([
  'fadeIn',
  'slideUp',
  'slideDown',
  'slideLeft',
  'slideRight',
  'scaleIn',
  'bounce',
  'none',
])

const elementAnimationSchema = z.object({
  type: animationTypeSchema,
  duration: z.number().min(0).max(10000),
  delay: z.number().min(0).max(10000),
})

// ── Element Prop Schemas (discriminated on `kind`) ──────────────────────────

const textPropsSchema = z.object({
  kind: z.literal('text'),
  content: z.string().max(5000),
  fontFamily: z.string().max(200),
  fontSize: z.number().min(8).max(200),
  fontWeight: z.number().min(100).max(900),
  lineHeight: z.number().min(0.5).max(5),
  letterSpacing: z.number().min(-10).max(50),
  color: cssColorString(),
  textAlign: z.enum(['left', 'center', 'right']),
  textShadow: z.string().max(200),
  bold: z.boolean(),
  italic: z.boolean(),
  underline: z.boolean(),
})

const imagePropsSchema = z.object({
  kind: z.literal('image'),
  src: z.string().url().max(2000),
  alt: z.string().max(500),
  objectFit: z.enum(['cover', 'contain', 'fill']),
  borderRadius: z.number().min(0).max(500),
  opacity: z.number().min(0).max(1),
})

const buttonPropsSchema = z.object({
  kind: z.literal('button'),
  text: z.string().max(500),
  linkUrl: z.string().max(2000),
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

const shapePropsSchema = z.object({
  kind: z.literal('shape'),
  shapeType: z.enum(['rectangle', 'circle', 'rounded-rect']),
  fillColor: cssColorString(),
  borderWidth: z.number().min(0).max(20),
  borderColor: cssColorString(),
  borderRadius: z.number().min(0).max(500),
  opacity: z.number().min(0).max(1),
})

const dividerPropsSchema = z.object({
  kind: z.literal('divider'),
  orientation: z.enum(['horizontal', 'vertical']),
  thickness: z.number().min(1).max(50),
  color: cssColorString(),
  style: z.enum(['solid', 'dashed', 'dotted']),
})

const iconPropsSchema = z.object({
  kind: z.literal('icon'),
  iconName: z.string().max(200),
  size: z.number().min(8).max(512),
  color: cssColorString(),
})

const videoPropsSchema = z.object({
  kind: z.literal('video'),
  videoUrl: z.string().url().max(2000),
  autoplay: z.boolean(),
  muted: z.boolean(),
  loop: z.boolean(),
  posterImage: z.string().max(2000),
})

const countdownPropsSchema = z.object({
  kind: z.literal('countdown'),
  targetDate: z.string().datetime(),
  showDays: z.boolean(),
  showHours: z.boolean(),
  showMinutes: z.boolean(),
  showSeconds: z.boolean(),
  fontSize: z.number().min(8).max(200),
  color: cssColorString(),
  separatorColor: cssColorString(),
})

const socialProofPropsSchema = z.object({
  kind: z.literal('social-proof'),
  presetType: z.enum(['orders', 'merchants', 'custom']),
  text: z.string().max(500),
  number: z.number().min(0).max(99999999),
  iconName: z.string().max(200),
  badgeStyle: z.enum(['pill', 'rounded', 'square']),
  backgroundColor: cssColorString(),
  textColor: cssColorString(),
})

const animatedBgPropsSchema = z.object({
  kind: z.literal('animated-bg'),
  gradientType: z.enum(['linear', 'radial', 'none']),
  gradientColors: z.array(cssColorString()).max(10),
  gradientAngle: z.number().min(0).max(360),
  patternType: z.enum(['dots', 'lines', 'grid', 'none']),
  patternOpacity: z.number().min(0).max(1),
  parallax: z.boolean(),
})

// ── Discriminated union of element props ────────────────────────────────────

const elementPropsSchema = z.discriminatedUnion('kind', [
  textPropsSchema,
  imagePropsSchema,
  buttonPropsSchema,
  shapePropsSchema,
  dividerPropsSchema,
  iconPropsSchema,
  videoPropsSchema,
  countdownPropsSchema,
  socialProofPropsSchema,
  animatedBgPropsSchema,
])

// ── Hero Element ────────────────────────────────────────────────────────────

const heroElementSchema = z.object({
  id: z.string().uuid(),
  type: z.enum([
    'text',
    'image',
    'button',
    'shape',
    'divider',
    'icon',
    'video',
    'countdown',
    'social-proof',
    'animated-bg',
  ]),
  label: z.string().max(100),
  visible: z.boolean(),
  locked: z.boolean(),
  zIndex: z.number().int().min(0).max(1000),
  desktop: elementLayoutSchema,
  mobile: elementLayoutSchema,
  props: elementPropsSchema,
  animation: elementAnimationSchema,
})

// ── Canvas & Design ─────────────────────────────────────────────────────────

const canvasConfigSchema = z.object({
  desktop: z.object({
    width: z.literal(1440),
    height: z.number().int().min(100).max(2000),
  }),
  mobile: z.object({
    width: z.literal(390),
    height: z.number().int().min(100).max(2000),
  }),
})

export const heroDesignSchema = z.object({
  version: z.literal(1),
  canvas: canvasConfigSchema,
  backgroundColor: cssColorString(),
  backgroundImage: z
    .object({
      url: z.string().url().max(2000),
      opacity: z.number().min(0).max(1),
      objectFit: z.enum(['cover', 'contain', 'fill']),
    })
    .optional(),
  elements: z.array(heroElementSchema).max(50),
})

/** Validated HeroDesign type inferred from the Zod schema */
export type ValidatedHeroDesign = z.infer<typeof heroDesignSchema>

// ── Re-exports for individual schema use ────────────────────────────────────

export {
  spacingSchema,
  elementLayoutSchema,
  animationTypeSchema,
  elementAnimationSchema,
  elementPropsSchema,
  heroElementSchema,
  canvasConfigSchema,
  textPropsSchema,
  imagePropsSchema,
  buttonPropsSchema,
  shapePropsSchema,
  dividerPropsSchema,
  iconPropsSchema,
  videoPropsSchema,
  countdownPropsSchema,
  socialProofPropsSchema,
  animatedBgPropsSchema,
  cssColorString,
}
