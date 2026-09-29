// ---------------------------------------------------------------------------
// Design → one scoped stylesheet. The storefront renders the design ONCE and
// this sheet adapts it per device with container queries (desktop-first, the
// same cascade as resolveStyle). Every value is re-validated here, because
// this string is injected into a <style> element.
// ---------------------------------------------------------------------------

import { DEVICE_MAX_WIDTH, FONT_OPTIONS, LIMITS, SHADOWS, THEME_COLOR_FALLBACK, THEME_COLOR_KEYS } from './constants'
import { resolveStyle } from './resolve'
import { clampNumber, cssColor, cssUrl, pickEnum } from './safe-values'
import { HERO_BASE_CSS } from './base-css'
import type { Background, Box, Device, HeroDesignV5, NodeStyle, Section, Widget } from './types'

type Decls = Map<string, string>
/** selector suffix (relative to the node's class) → declarations */
type RuleSet = Map<string, Decls>

export interface CssBuildOptions {
  /** Root class; must be a plain [a-z0-9-] identifier. */
  scope: string
  /** Editor canvas: show hidden nodes faded instead of removing them. */
  showHidden?: boolean
}

export interface BuiltDesignCss {
  css: string
  /** node id → class name used in the sheet */
  classes: Record<string, string>
  /** Google Fonts stylesheet for the fonts the design uses, or null. */
  fontsHref: string | null
}

const ALIGN_SELF = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' } as const
const JUSTIFY = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' } as const
const TEXT_JUSTIFY = { left: 'flex-start', center: 'center', right: 'flex-end', justify: 'flex-start' } as const
const ASPECTS = ['auto', '1/1', '4/3', '3/2', '16/9', '21/9', '3/4', '9/16'] as const
const BG_POSITIONS = ['center', 'top', 'bottom', 'left', 'right'] as const

/**
 * Own-property table lookup. Style values come from stored JSON, so a key like
 * `constructor` or `__proto__` must never resolve to an Object.prototype member
 * (that crashed the sheet build, or leaked function source into the CSS).
 */
function own<T>(table: Readonly<Record<string, T>>, key: unknown): T | undefined {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined
}

function set(rules: RuleSet, suffix: string, prop: string, value: string | null | undefined): void {
  if (value === null || value === undefined) return
  const decls = rules.get(suffix) ?? new Map<string, string>()
  decls.set(prop, value)
  rules.set(suffix, decls)
}

function px(value: unknown, min: number, max: number): string | null {
  const n = clampNumber(value, min, max)
  return n === null ? null : `${n}px`
}

function boxValue(box: Box | undefined, min: number, max: number): string | null {
  if (!box || typeof box !== 'object') return null
  const parts = [box.top, box.right, box.bottom, box.left].map((v) => clampNumber(v, min, max) ?? 0)
  return parts.map((v) => `${v}px`).join(' ')
}

function overlayColor(bg: Background): string | null {
  const color = cssColor(bg.overlay?.color)
  const opacity = clampNumber(bg.overlay?.opacity, 0, 100)
  if (!color || opacity === null || opacity === 0) return null
  return `color-mix(in srgb, ${color} ${opacity}%, transparent)`
}

function gradientValue(bg: Background): string | null {
  const g = bg.gradient
  if (!g) return null
  const from = cssColor(g.from)
  const to = cssColor(g.to)
  if (!from || !to) return null
  if (g.kind === 'radial') return `radial-gradient(circle at center, ${from}, ${to})`
  return `linear-gradient(${clampNumber(g.angle, 0, 360) ?? 180}deg, ${from}, ${to})`
}

/** Background shorthand pieces. Video backgrounds are real elements (see renderer). */
function backgroundRules(rules: RuleSet, suffix: string, bg: Background | undefined): void {
  if (!bg || typeof bg !== 'object') return
  const overlay = overlayColor(bg)
  const layers: string[] = []
  let color: string | null = null
  if (bg.type === 'color') color = cssColor(bg.color)
  if (bg.type === 'gradient') {
    const gradient = gradientValue(bg)
    if (gradient) layers.push(gradient)
  }
  if (bg.type === 'image') {
    const url = cssUrl(bg.image?.url)
    if (overlay) layers.push(`linear-gradient(${overlay}, ${overlay})`)
    if (url) layers.push(url)
    color = cssColor(bg.color)
  }
  set(rules, suffix, 'background-color', color ?? 'transparent')
  set(rules, suffix, 'background-image', layers.length ? layers.join(', ') : 'none')
  if (bg.type === 'image') {
    const size = pickEnum(bg.image?.size, ['cover', 'contain', 'auto'] as const) ?? 'cover'
    const position = pickEnum(bg.image?.position, BG_POSITIONS) ?? 'center'
    set(rules, suffix, 'background-size', size)
    set(rules, suffix, 'background-position', position)
    set(rules, suffix, 'background-repeat', 'no-repeat')
  }
  if (bg.type === 'video') {
    set(rules, `${suffix} > .hb-bg-overlay`, 'background-color', overlay ?? 'transparent')
  }
  set(rules, `${suffix} > .hb-bg-video`, 'display', bg.type === 'video' ? 'block' : 'none')
}

/** Frame styles: padding, background, border, radius, shadow, opacity. */
function frameRules(rules: RuleSet, suffix: string, s: NodeStyle, skipRadius = false): void {
  set(rules, suffix, 'padding', boxValue(s.padding, 0, 400))
  backgroundRules(rules, suffix, s.background)
  if (s.borderWidth !== undefined) {
    set(rules, suffix, 'border-width', px(s.borderWidth, 0, 24))
    set(rules, suffix, 'border-style', pickEnum(s.borderStyle, ['solid', 'dashed', 'dotted'] as const) ?? 'solid')
    set(rules, suffix, 'border-color', cssColor(s.borderColor) ?? 'currentColor')
  }
  if (!skipRadius) set(rules, suffix, 'border-radius', px(s.radius, 0, 999))
  if (s.shadow !== undefined) set(rules, suffix, 'box-shadow', own(SHADOWS, s.shadow) ?? 'none')
  const opacity = clampNumber(s.opacity, 0, 100)
  if (opacity !== null) set(rules, suffix, 'opacity', String(opacity / 100))
}

function typographyRules(rules: RuleSet, suffix: string, s: NodeStyle): void {
  set(rules, suffix, 'color', cssColor(s.color))
  set(rules, suffix, 'font-family', own(FONT_OPTIONS, s.fontFamily)?.css)
  set(rules, suffix, 'font-size', px(s.fontSize, 8, 200))
  const weight = clampNumber(s.fontWeight, 100, 900)
  if (weight !== null) set(rules, suffix, 'font-weight', String(Math.round(weight / 100) * 100))
  const lineHeight = clampNumber(s.lineHeight, 0.7, 3)
  if (lineHeight !== null) set(rules, suffix, 'line-height', String(lineHeight))
  set(rules, suffix, 'letter-spacing', px(s.letterSpacing, -10, 40))
  set(rules, suffix, 'text-align', pickEnum(s.textAlign, ['left', 'center', 'right', 'justify'] as const))
  set(rules, suffix, 'text-transform', pickEnum(s.textTransform, ['none', 'uppercase', 'lowercase', 'capitalize'] as const))
  if (s.italic !== undefined) set(rules, suffix, 'font-style', s.italic ? 'italic' : 'normal')
}

function displayRules(rules: RuleSet, s: NodeStyle, display: string, showHidden: boolean): void {
  if (s.hidden === undefined) return
  if (!s.hidden) {
    set(rules, '', 'display', display)
    set(rules, '', 'outline', 'none')
    return
  }
  if (showHidden) {
    set(rules, '', 'display', display)
    set(rules, '', 'outline', '2px dashed rgba(100,116,139,.6)')
    set(rules, '', 'filter', 'grayscale(1) opacity(.45)')
  } else {
    set(rules, '', 'display', 'none')
  }
}

function minHeightValue(s: NodeStyle): string | null {
  if (s.fullHeight) return '100svh'
  return px(s.minHeight, 0, 2000)
}

function sectionRules(section: Section, s: NodeStyle, showHidden: boolean): RuleSet {
  const rules: RuleSet = new Map()
  displayRules(rules, s, 'flex', showHidden)
  frameRules(rules, '', s)
  typographyRules(rules, '', s)
  set(rules, '', 'margin', boxValue(s.margin, -400, 400))
  if (s.fullHeight !== undefined || s.minHeight !== undefined) set(rules, '', 'min-height', minHeightValue(s) ?? '0px')
  set(rules, '', 'justify-content', own(JUSTIFY, s.verticalAlign))
  const contentWidth = clampNumber(s.contentWidth, 0, 2400)
  if (contentWidth !== null) set(rules, ' > .hb-row', 'max-width', contentWidth === 0 ? 'none' : `${contentWidth}px`)
  set(rules, ' > .hb-row', 'gap', px(s.gap, 0, 200))
  if (s.stack !== undefined || s.reverse !== undefined) {
    const stacked = !!s.stack
    set(rules, ' > .hb-row', 'flex-direction', stacked ? (s.reverse ? 'column-reverse' : 'column') : 'row')
    set(rules, ' > .hb-row > .hb-col', 'flex', stacked ? '0 0 auto' : 'var(--hb-w, 1) 1 0%')
    set(rules, ' > .hb-row > .hb-col', 'width', stacked ? '100%' : 'auto')
  }
  set(rules, ' > .hb-row', 'align-items', own(ALIGN_SELF, s.align))
  // A section's own id doubles as its anchor target only through `anchor`.
  void section
  return rules
}

function columnRules(s: NodeStyle, showHidden: boolean): RuleSet {
  const rules: RuleSet = new Map()
  displayRules(rules, s, 'flex', showHidden)
  frameRules(rules, '', s)
  typographyRules(rules, '', s)
  set(rules, '', 'margin', boxValue(s.margin, -400, 400))
  const width = clampNumber(s.width, 1, 100)
  if (width !== null) set(rules, '', '--hb-w', String(width))
  set(rules, '', 'gap', px(s.gap, 0, 200))
  set(rules, '', 'justify-content', own(JUSTIFY, s.verticalAlign))
  set(rules, '', 'min-height', px(s.minHeight, 0, 2000))
  return rules
}

/** Kinds whose frame (background, padding, border…) wraps the inner element, not the full-width row. */
const INNER_FRAME: Partial<Record<Widget['kind'], string>> = {
  badge: ' .hb-badge',
  icon: ' .hb-icon-inner',
}

function widgetRules(widget: Widget, s: NodeStyle, showHidden: boolean): RuleSet {
  const rules: RuleSet = new Map()
  const { kind } = widget
  displayRules(rules, s, 'block', showHidden)
  const frameTarget = own(INNER_FRAME, kind) ?? ''
  frameRules(rules, frameTarget, s, kind === 'buttons' || kind === 'gallery')
  typographyRules(rules, '', s)
  set(rules, '', 'margin', boxValue(s.margin, -400, 400))
  const width = clampNumber(s.width, 1, 100)
  if (width !== null) set(rules, '', 'width', `${width}%`)
  const maxWidth = clampNumber(s.maxWidth, 0, 2400)
  if (maxWidth !== null) set(rules, '', 'max-width', maxWidth === 0 ? 'none' : `${maxWidth}px`)
  set(rules, '', 'align-self', own(ALIGN_SELF, s.align))
  // Centred text/buttons/badges: a boxed widget sits in the middle too.
  if (s.textAlign && s.align === undefined && (s.width !== undefined || s.maxWidth !== undefined)) {
    set(rules, '', 'margin-inline', s.textAlign === 'center' ? 'auto' : s.textAlign === 'right' ? 'auto 0' : null)
  }
  const justify = own(TEXT_JUSTIFY, s.textAlign) ?? null
  const accent = cssColor(s.accentColor)
  const accentText = cssColor(s.accentTextColor)
  const aspect = pickEnum(s.aspectRatio, ASPECTS)
  const aspectValue = aspect && aspect !== 'auto' ? aspect.replace('/', ' / ') : aspect === 'auto' ? 'auto' : null

  switch (kind) {
    case 'buttons':
      set(rules, '', '--hb-btn-bg', accent)
      set(rules, '', '--hb-btn-fg', accentText)
      set(rules, '', '--hb-btn-radius', px(s.radius, 0, 999))
      set(rules, ' .hb-btns', 'justify-content', justify)
      set(rules, ' .hb-btns', 'gap', px(s.gap, 0, 120))
      if (s.align !== undefined) set(rules, ' .hb-btn', 'flex', s.align === 'stretch' ? '1 1 0%' : '0 1 auto')
      break
    case 'image':
      set(rules, ' img', 'aspect-ratio', aspectValue)
      set(rules, ' img', 'height', aspect ? (aspect === 'auto' ? 'auto' : '100%') : null)
      set(rules, ' img', 'object-fit', pickEnum(s.objectFit, ['cover', 'contain'] as const))
      break
    case 'video':
      set(rules, ' .hb-media', 'aspect-ratio', aspectValue === 'auto' ? '16 / 9' : aspectValue)
      set(rules, ' .hb-media', 'border-radius', px(s.radius, 0, 999))
      break
    case 'icon':
      set(rules, ' svg', 'width', px(s.size, 8, 400))
      set(rules, ' svg', 'height', px(s.size, 8, 400))
      set(rules, ' .hb-icon-inner', 'background-color', accent)
      break
    case 'icon-list':
      set(rules, ' .hb-list', 'gap', px(s.gap, 0, 120))
      set(rules, ' .hb-list', 'justify-content', justify)
      set(rules, ' .hb-list svg', 'color', accent)
      set(rules, ' .hb-list svg', 'width', px(s.size, 8, 120))
      set(rules, ' .hb-list svg', 'height', px(s.size, 8, 120))
      break
    case 'badge':
      set(rules, ' .hb-badge svg', 'color', accent)
      break
    case 'countdown':
      set(rules, ' .hb-cd', 'justify-content', justify)
      set(rules, ' .hb-cd', 'gap', px(s.gap, 0, 120))
      set(rules, '', '--hb-cd-bg', accent)
      set(rules, '', '--hb-cd-fg', accentText)
      break
    case 'divider':
      set(rules, ' .hb-divider', 'border-top-width', px(s.size, 1, 40))
      set(rules, ' .hb-divider', 'border-top-color', accent)
      break
    case 'spacer':
      set(rules, '', 'height', px(s.size, 0, 800))
      break
    case 'gallery': {
      const columns = clampNumber(s.columns, 1, 8)
      if (columns !== null) set(rules, ' .hb-gallery', 'grid-template-columns', `repeat(${Math.round(columns)}, minmax(0, 1fr))`)
      set(rules, ' .hb-gallery', 'gap', px(s.gap, 0, 120))
      set(rules, ' .hb-gallery img', 'aspect-ratio', aspectValue)
      set(rules, ' .hb-gallery img', 'border-radius', px(s.radius, 0, 999))
      set(rules, ' .hb-gallery img', 'object-fit', pickEnum(s.objectFit, ['cover', 'contain'] as const))
      break
    }
    default:
      break
  }
  return rules
}

const ANIMATIONS = ['fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'zoom'] as const

function animationRule(widget: Widget): string | null {
  const a = widget.animation
  const type = pickEnum(a?.type, ANIMATIONS)
  if (!a || !type) return null
  const duration = clampNumber(a.duration, 100, 4000) ?? 600
  const delay = clampNumber(a.delay, 0, 6000) ?? 0
  return `hb-${type} ${duration}ms cubic-bezier(.2,.7,.2,1) ${delay}ms both`
}

function serialize(scope: string, cls: string, rules: RuleSet): string {
  let out = ''
  for (const [suffix, decls] of rules) {
    if (decls.size === 0) continue
    const body = [...decls].map(([p, v]) => `${p}:${v}`).join(';')
    out += `.${scope} .${cls}${suffix}{${body}}`
  }
  return out
}

/** Declarations at `device` that differ from the wider device's. */
function diffRules(prev: RuleSet, next: RuleSet): RuleSet {
  const out: RuleSet = new Map()
  const suffixes = new Set([...prev.keys(), ...next.keys()])
  for (const suffix of suffixes) {
    const a = prev.get(suffix) ?? new Map<string, string>()
    const b = next.get(suffix) ?? new Map<string, string>()
    const changed = new Map<string, string>()
    for (const [prop, value] of b) if (a.get(prop) !== value) changed.set(prop, value)
    for (const prop of a.keys()) if (!b.has(prop)) changed.set(prop, 'unset')
    if (changed.size) out.set(suffix, changed)
  }
  return out
}

interface NodeEntry {
  cls: string
  build: (device: Device) => RuleSet
  extra?: string
}

function collectNodes(design: HeroDesignV5, showHidden: boolean): { entries: NodeEntry[]; classes: Record<string, string> } {
  const entries: NodeEntry[] = []
  const classes: Record<string, string> = {}
  let counter = 0
  const nextClass = (id: string) => {
    const cls = `n${(counter++).toString(36)}`
    classes[id] = cls
    return cls
  }
  for (const section of design.sections) {
    const sectionCls = nextClass(section.id)
    entries.push({ cls: sectionCls, build: (d) => sectionRules(section, resolveStyle(section, d), showHidden) })
    for (const column of section.columns) {
      const colCls = nextClass(column.id)
      entries.push({ cls: colCls, build: (d) => columnRules(resolveStyle(column, d), showHidden) })
      for (const widget of column.widgets) {
        const cls = nextClass(widget.id)
        const animation = animationRule(widget)
        entries.push({
          cls,
          build: (d) => widgetRules(widget, resolveStyle(widget, d), showHidden),
          extra: animation ? `animation:${animation}` : undefined,
        })
      }
    }
  }
  return { entries, classes }
}

function themeVars(design: HeroDesignV5): string {
  const vars: string[] = []
  for (const key of THEME_COLOR_KEYS) {
    const custom = cssColor(design.theme?.colors?.[key])
    // A theme color may not reference itself or another theme color.
    const safe = custom && !custom.startsWith('var(--hb-') ? custom : null
    vars.push(`--hb-${key}:${safe ?? THEME_COLOR_FALLBACK[key]}`)
  }
  const heading = own(FONT_OPTIONS, design.theme?.headingFont)
  const body = own(FONT_OPTIONS, design.theme?.bodyFont)
  vars.push(`--hb-heading-font:${heading?.google || heading?.css.startsWith('ui-') ? heading.css : 'var(--brand-heading-font)'}`)
  vars.push(`--hb-body-font:${body?.google || body?.css.startsWith('ui-') ? body.css : 'var(--brand-body-font)'}`)
  vars.push(`--hb-btn-radius:${clampNumber(design.theme?.buttonRadius, 0, 999) ?? 10}px`)
  vars.push('--hb-btn-bg:var(--hb-primary)')
  vars.push('--hb-btn-fg:var(--brand-button-primary-text, #ffffff)')
  vars.push('--hb-cd-bg:var(--hb-surface)')
  vars.push('--hb-cd-fg:var(--hb-text)')
  return vars.join(';')
}

function collectFonts(design: HeroDesignV5): string[] {
  const used = new Set<string>()
  const add = (key: unknown) => {
    if (typeof key === 'string' && own(FONT_OPTIONS, key)?.google) used.add(key)
  }
  add(design.theme?.headingFont)
  add(design.theme?.bodyFont)
  const visit = (node: { style: NodeStyle; tablet?: NodeStyle; mobile?: NodeStyle }) => {
    add(node.style?.fontFamily)
    add(node.tablet?.fontFamily)
    add(node.mobile?.fontFamily)
  }
  for (const section of design.sections) {
    visit(section)
    for (const column of section.columns) {
      visit(column)
      column.widgets.forEach(visit)
    }
  }
  return [...used].sort()
}

export function buildFontsHref(fontKeys: readonly string[]): string | null {
  const families = fontKeys
    .map((key) => own(FONT_OPTIONS, key)?.google)
    .filter((g): g is NonNullable<typeof g> => !!g)
    .map((g) => `family=${encodeURIComponent(g.family).replace(/%20/g, '+')}:wght@${g.weights.join(';')}`)
  if (!families.length) return null
  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`
}

const SCOPE_PATTERN = /^[a-z][a-z0-9-]{0,40}$/

export function buildDesignCss(design: HeroDesignV5, options: CssBuildOptions): BuiltDesignCss {
  const scope = SCOPE_PATTERN.test(options.scope) ? options.scope : 'hb-root'
  const showHidden = !!options.showHidden
  const { entries, classes } = collectNodes(design, showHidden)

  let css = HERO_BASE_CSS.replace(/\.S\b/g, `.${scope}`)
  css += `.${scope}{${themeVars(design)}}`

  const previous = new Map<string, RuleSet>()
  for (const entry of entries) {
    const rules = entry.build('desktop')
    previous.set(entry.cls, rules)
    css += serialize(scope, entry.cls, rules)
    if (entry.extra) css += `.${scope} .${entry.cls}{${entry.extra}}`
  }
  for (const device of ['tablet', 'mobile'] as const) {
    let block = ''
    for (const entry of entries) {
      const rules = entry.build(device)
      const changed = diffRules(previous.get(entry.cls) ?? new Map(), rules)
      previous.set(entry.cls, rules)
      block += serialize(scope, entry.cls, changed)
    }
    if (block) css += `@container hb (max-width: ${DEVICE_MAX_WIDTH[device]}px){${block}}`
  }

  if (css.length > LIMITS.designBytes * 2) css = css.slice(0, LIMITS.designBytes * 2)
  return { css, classes, fontsHref: buildFontsHref(collectFonts(design)) }
}
