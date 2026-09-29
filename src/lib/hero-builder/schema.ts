// ---------------------------------------------------------------------------
// Save-time validation for v5 designs. Strict on shape and bounds so a bad
// payload is refused with a clear message; the renderer still re-validates
// every value on its own (see safe-values.ts).
// ---------------------------------------------------------------------------

import { z } from 'zod'

import { FONT_OPTIONS, LIMITS } from './constants'
import { isSafeColor, safeHref, safeMediaUrl } from './safe-values'

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid id')
const color = z.string().max(64).refine(isSafeColor, 'Invalid color')
const mediaUrl = z
  .string()
  .max(LIMITS.urlLength)
  .refine((v) => v === '' || safeMediaUrl(v) !== null, 'Images and videos must use an https:// link')
const href = z
  .string()
  .max(LIMITS.urlLength)
  .refine((v) => v === '' || safeHref(v) !== null, 'Links must start with https://, /, #, mailto: or tel:')
// Own keys only: `'constructor' in FONT_OPTIONS` is true via the prototype.
const font = z
  .string()
  .refine((v) => v === '' || Object.prototype.hasOwnProperty.call(FONT_OPTIONS, v), 'Unknown font')
const shortText = z.string().max(LIMITS.shortText)
const iconName = z.string().regex(/^[A-Za-z0-9]{0,40}$/, 'Invalid icon')
const num = (min: number, max: number) => z.number().finite().min(min).max(max)

const box = z.object({
  top: num(-400, 400),
  right: num(-400, 400),
  bottom: num(-400, 400),
  left: num(-400, 400),
})

const background = z.object({
  type: z.enum(['none', 'color', 'gradient', 'image', 'video']),
  color: color.optional(),
  gradient: z
    .object({ kind: z.enum(['linear', 'radial']), from: color, to: color, angle: num(0, 360) })
    .optional(),
  image: z
    .object({
      url: mediaUrl,
      size: z.enum(['cover', 'contain', 'auto']),
      position: z.enum(['center', 'top', 'bottom', 'left', 'right']),
    })
    .optional(),
  videoUrl: mediaUrl.optional(),
  overlay: z.object({ color, opacity: num(0, 100) }).optional(),
})

const style = z
  .object({
    hidden: z.boolean(),
    padding: box,
    margin: box,
    background,
    borderWidth: num(0, 24),
    borderStyle: z.enum(['solid', 'dashed', 'dotted']),
    borderColor: color,
    radius: num(0, 999),
    shadow: z.enum(['none', 'sm', 'md', 'lg', 'xl']),
    opacity: num(0, 100),
    color,
    fontFamily: font,
    fontSize: num(8, 200),
    fontWeight: num(100, 900),
    lineHeight: num(0.7, 3),
    letterSpacing: num(-10, 40),
    textAlign: z.enum(['left', 'center', 'right', 'justify']),
    textTransform: z.enum(['none', 'uppercase', 'lowercase', 'capitalize']),
    italic: z.boolean(),
    width: num(1, 100),
    maxWidth: num(0, 2400),
    minHeight: num(0, 2000),
    fullHeight: z.boolean(),
    contentWidth: num(0, 2400),
    align: z.enum(['start', 'center', 'end', 'stretch']),
    verticalAlign: z.enum(['start', 'center', 'end', 'between']),
    gap: num(0, 200),
    stack: z.boolean(),
    reverse: z.boolean(),
    size: num(0, 800),
    aspectRatio: z.enum(['auto', '1/1', '4/3', '3/2', '16/9', '21/9', '3/4', '9/16']),
    objectFit: z.enum(['cover', 'contain']),
    columns: num(1, 8),
    accentColor: color,
    accentTextColor: color,
  })
  .partial()

const responsive = { style, tablet: style.optional(), mobile: style.optional() }

const animation = z.object({
  type: z.enum(['none', 'fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'zoom']),
  duration: num(100, 4000),
  delay: num(0, 6000),
})

const content = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('heading'), text: z.string().max(LIMITS.textLength), tag: z.enum(['h1', 'h2', 'h3', 'h4', 'p']) }),
  z.object({ kind: z.literal('text'), text: z.string().max(LIMITS.textLength) }),
  z.object({
    kind: z.literal('buttons'),
    items: z
      .array(
        z.object({
          id,
          label: shortText,
          href,
          newTab: z.boolean(),
          variant: z.enum(['solid', 'outline', 'ghost']),
          icon: iconName.optional(),
        }),
      )
      .max(LIMITS.buttonsPerWidget),
  }),
  z.object({ kind: z.literal('image'), src: mediaUrl, alt: shortText, href: href.optional(), newTab: z.boolean().optional() }),
  z.object({
    kind: z.literal('video'),
    url: mediaUrl,
    autoplay: z.boolean(),
    muted: z.boolean(),
    loop: z.boolean(),
    controls: z.boolean(),
  }),
  z.object({ kind: z.literal('icon'), name: iconName, href: href.optional() }),
  z.object({
    kind: z.literal('icon-list'),
    layout: z.enum(['vertical', 'inline']),
    items: z.array(z.object({ id, icon: iconName, text: shortText })).max(LIMITS.listItems),
  }),
  z.object({ kind: z.literal('badge'), text: shortText, icon: iconName.optional() }),
  z.object({
    kind: z.literal('countdown'),
    target: z.string().max(64).refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid countdown date'),
    showLabels: z.boolean(),
    expiredText: shortText,
  }),
  z.object({ kind: z.literal('divider'), lineStyle: z.enum(['solid', 'dashed', 'dotted']) }),
  z.object({ kind: z.literal('spacer') }),
  z.object({
    kind: z.literal('gallery'),
    images: z.array(z.object({ id, src: mediaUrl, alt: shortText })).max(LIMITS.galleryImages),
  }),
  z.object({ kind: z.literal('html'), html: z.string().max(LIMITS.htmlLength, 'HTML block is too long (50,000 characters max)') }),
  z.object({
    kind: z.literal('embed'),
    code: z.string().max(LIMITS.embedLength, 'Embed code is too long (50,000 characters max)'),
    height: num(40, LIMITS.embedMaxHeight),
    autoHeight: z.boolean(),
  }),
])

const widget = z
  .object({
    id,
    kind: z.enum([
      'heading', 'text', 'buttons', 'image', 'video', 'icon', 'icon-list',
      'badge', 'countdown', 'divider', 'spacer', 'gallery', 'html', 'embed',
    ]),
    content,
    animation: animation.optional(),
    ...responsive,
  })
  .refine((w) => w.kind === w.content.kind, 'Widget kind does not match its content')

const column = z.object({ id, widgets: z.array(widget), ...responsive })

const section = z.object({
  id,
  label: z.string().max(80),
  anchor: z.string().regex(/^[a-z0-9-]{0,48}$/, 'Anchors use lowercase letters, numbers and dashes').optional(),
  columns: z.array(column).min(1).max(LIMITS.columnsPerSection),
  ...responsive,
})

const theme = z.object({
  colors: z
    .object({
      primary: color,
      secondary: color,
      accent: color,
      text: color,
      muted: color,
      background: color,
      surface: color,
    })
    .partial(),
  headingFont: font,
  bodyFont: font,
  buttonRadius: num(0, 999),
})

export const heroDesignV5Schema = z
  .object({
    version: z.literal(5),
    theme,
    sections: z.array(section).max(LIMITS.sections, `A hero can have at most ${LIMITS.sections} sections`),
  })
  .refine(
    (d) => d.sections.reduce((n, s) => n + s.columns.reduce((m, c) => m + c.widgets.length, 0), 0) <= LIMITS.widgetsTotal,
    `A hero can have at most ${LIMITS.widgetsTotal} elements`,
  )

export type HeroDesignV5Input = z.infer<typeof heroDesignV5Schema>
