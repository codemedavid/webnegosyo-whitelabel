// ---------------------------------------------------------------------------
// v4 (Hero Block Designer) → v5. Runs on the fly in the storefront and when
// the editor opens an old design, so live v4 heroes keep rendering without a
// data migration. Lossy by design for things v5 dropped (text shadows,
// decorative animated backgrounds); everything a diner sees survives.
// ---------------------------------------------------------------------------

import type {
  BlockBackground,
  BlockColumn,
  BlockSection,
  BlockWidget,
  HeroBlockDesign,
  SectionBackground,
  WidgetOverrides,
} from '@/types/hero-block-designer'

import { DEFAULT_THEME, newId } from './defaults'
import { FONT_OPTIONS } from './constants'
import { isSafeColor, safeHref, safeMediaUrl } from './safe-values'
import type {
  AnimationType,
  Background,
  Column,
  HeroDesignV5,
  NodeStyle,
  Section,
  Widget,
  WidgetContent,
} from './types'

const ALIGN: Record<string, NodeStyle['align']> = { left: 'start', center: 'center', right: 'end' }
const VALIGN: Record<string, NodeStyle['verticalAlign']> = { top: 'start', center: 'center', bottom: 'end' }
const ANIMATION: Record<string, AnimationType> = {
  fadeIn: 'fade',
  slideUp: 'slide-up',
  slideDown: 'slide-down',
  slideLeft: 'slide-left',
  slideRight: 'slide-right',
  scaleIn: 'zoom',
  bounce: 'slide-up',
}

const color = (value: unknown): string | undefined => (isSafeColor(value) ? value.trim() : undefined)
const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

function fontKey(fontFamily: unknown): string | undefined {
  if (typeof fontFamily !== 'string' || !fontFamily.trim()) return undefined
  const primary = fontFamily.split(',')[0].replace(/['"]/g, '').trim().toLowerCase()
  return Object.entries(FONT_OPTIONS).find(([, f]) => f.google?.family.toLowerCase() === primary)?.[0]
}

/** Best-effort read of a CSS gradient string: angle + first two colors. */
function parseGradient(css: unknown): Background | undefined {
  if (typeof css !== 'string') return undefined
  const colors = css.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi) ?? []
  const from = color(colors[0])
  const to = color(colors[1] ?? colors[0])
  if (!from || !to) return undefined
  const angle = num(Number(/(-?\d+(?:\.\d+)?)deg/.exec(css)?.[1])) ?? 180
  return { type: 'gradient', gradient: { kind: /radial/i.test(css) ? 'radial' : 'linear', from, to, angle: ((angle % 360) + 360) % 360 } }
}

function blockBackground(bg: BlockBackground | undefined): Background | undefined {
  if (!bg || bg.type === 'none') return undefined
  if (bg.type === 'color') {
    const c = color(bg.color)
    return c ? { type: 'color', color: c } : undefined
  }
  if (bg.type === 'gradient') return parseGradient(bg.gradient)
  const url = safeMediaUrl(bg.image?.url)
  if (!url) return undefined
  return { type: 'image', image: { url, size: bg.image?.objectFit === 'contain' ? 'contain' : 'cover', position: 'center' } }
}

function sectionBackground(bg: SectionBackground | undefined): Background | undefined {
  if (!bg) return undefined
  if (bg.type === 'color') {
    const c = color(bg.color)
    return c ? { type: 'color', color: c } : undefined
  }
  if (bg.type === 'gradient') return parseGradient(bg.gradient)
  if (bg.type === 'image') {
    const url = safeMediaUrl(bg.image)
    return url ? { type: 'image', image: { url, size: 'cover', position: 'center' } } : undefined
  }
  const video = safeMediaUrl(bg.video)
  return video ? { type: 'video', videoUrl: video } : undefined
}

function widthStyle(width: unknown): Pick<NodeStyle, 'width' | 'maxWidth'> {
  if (typeof width !== 'string') return {}
  const pct = /^(\d+(?:\.\d+)?)%$/.exec(width.trim())
  if (pct) {
    const w = Number(pct[1])
    return w > 0 && w < 100 ? { width: w } : {}
  }
  const px = /^(\d+(?:\.\d+)?)px$/.exec(width.trim())
  return px ? { maxWidth: Number(px[1]) } : {}
}

function textStyle(p: Record<string, unknown>): NodeStyle {
  const style: NodeStyle = {}
  const fontSize = num(p.fontSize)
  if (fontSize) style.fontSize = fontSize
  const weight = p.bold ? 700 : num(p.fontWeight)
  if (weight) style.fontWeight = weight
  const lineHeight = num(p.lineHeight)
  if (lineHeight) style.lineHeight = lineHeight
  const letterSpacing = num(p.letterSpacing)
  if (letterSpacing !== undefined) style.letterSpacing = letterSpacing
  const c = color(p.color)
  if (c) style.color = c
  if (p.textAlign === 'left' || p.textAlign === 'center' || p.textAlign === 'right') style.textAlign = p.textAlign
  if (p.italic) style.italic = true
  const font = fontKey(p.fontFamily)
  if (font) style.fontFamily = font
  return style
}

function overrideStyle(o: WidgetOverrides | undefined): NodeStyle | undefined {
  if (!o) return undefined
  const style: NodeStyle = { ...(o.props ? textStyle(o.props as Record<string, unknown>) : {}) }
  if (o.alignment) {
    style.textAlign = o.alignment
  }
  if (o.padding) style.padding = { ...o.padding }
  return Object.keys(style).length ? style : undefined
}

function widgetContent(w: BlockWidget): { content: WidgetContent; style: NodeStyle } | null {
  const p = w.props as unknown as Record<string, unknown>
  switch (w.props.kind) {
    case 'text': {
      const style = textStyle(p)
      const text = String(w.props.content ?? '')
      if ((style.fontSize ?? 16) >= 28) return { content: { kind: 'heading', text, tag: 'h2' }, style }
      return { content: { kind: 'text', text }, style }
    }
    case 'image':
      return {
        content: { kind: 'image', src: safeMediaUrl(w.props.src) ?? '', alt: String(w.props.alt ?? '') },
        style: {
          radius: num(w.props.borderRadius),
          objectFit: w.props.objectFit === 'contain' ? 'contain' : 'cover',
          ...(num(w.props.opacity) !== undefined && w.props.opacity < 1 ? { opacity: Math.round(w.props.opacity * 100) } : {}),
          ...(num(w.props.width) ? { maxWidth: w.props.width } : {}),
        },
      }
    case 'button': {
      const bg = color(w.props.backgroundColor)
      const outline = (!bg || bg === 'transparent') && (w.props.borderWidth ?? 0) > 0
      return {
        content: {
          kind: 'buttons',
          items: [{
            id: newId(),
            label: String(w.props.text ?? 'Button'),
            href: safeHref(w.props.linkUrl) ?? '',
            newTab: w.props.linkTarget === '_blank',
            variant: outline ? 'outline' : 'solid',
          }],
        },
        style: {
          accentColor: outline ? color(w.props.borderColor) : bg,
          accentTextColor: color(w.props.textColor),
          radius: num(w.props.borderRadius),
          fontSize: num(w.props.fontSize),
          fontWeight: num(w.props.fontWeight),
          textAlign: w.alignment,
        },
      }
    }
    case 'shape':
      return {
        content: { kind: 'spacer' },
        style: {
          size: 80,
          radius: w.props.shapeType === 'circle' ? 999 : num(w.props.borderRadius),
          background: color(w.props.fillColor) ? { type: 'color', color: color(w.props.fillColor) } : undefined,
        },
      }
    case 'divider':
      if (w.props.orientation === 'vertical') return null
      return {
        content: { kind: 'divider', lineStyle: w.props.style },
        style: { size: num(w.props.thickness), accentColor: color(w.props.color) },
      }
    case 'spacer':
      return { content: { kind: 'spacer' }, style: { size: num(w.props.height) ?? 40 } }
    case 'icon':
      return {
        content: { kind: 'icon', name: /^[A-Za-z0-9]{1,40}$/.test(w.props.iconName) ? w.props.iconName : 'Star' },
        style: { size: num(w.props.size), color: color(w.props.color), textAlign: w.alignment },
      }
    case 'video':
      return {
        content: {
          kind: 'video',
          url: safeMediaUrl(w.props.videoUrl) ?? '',
          autoplay: !!w.props.autoplay,
          muted: w.props.muted !== false,
          loop: !!w.props.loop,
          controls: !w.props.autoplay,
        },
        style: { aspectRatio: '16/9' },
      }
    case 'countdown':
      return {
        content: {
          kind: 'countdown',
          target: Number.isNaN(Date.parse(w.props.targetDate)) ? new Date().toISOString() : w.props.targetDate,
          showLabels: true,
          expiredText: '',
        },
        style: { fontSize: num(w.props.fontSize), color: color(w.props.color), textAlign: w.alignment },
      }
    case 'social-proof': {
      const text = w.props.presetType === 'custom' || !w.props.number ? w.props.text : `${w.props.number}+ ${w.props.text}`
      return {
        content: { kind: 'badge', text: String(text ?? ''), icon: w.props.iconName || undefined },
        style: {
          color: color(w.props.textColor),
          background: color(w.props.backgroundColor) ? { type: 'color', color: color(w.props.backgroundColor) } : undefined,
          radius: w.props.badgeStyle === 'pill' ? 999 : w.props.badgeStyle === 'rounded' ? 10 : 0,
          padding: { top: 6, right: 14, bottom: 6, left: 14 },
          textAlign: w.alignment,
        },
      }
    }
    default:
      return null
  }
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}

function visibilityLayers(w: BlockWidget): Pick<Widget, 'tablet' | 'mobile'> & { hidden?: boolean } {
  const v = w.visibility ?? { desktop: true, tablet: true, mobile: true }
  const hidden = v.desktop === false
  const tabletHidden = v.tablet === false
  const mobileHidden = v.mobile === false
  return {
    hidden: hidden || undefined,
    tablet: tabletHidden !== hidden ? { hidden: tabletHidden } : undefined,
    mobile: mobileHidden !== tabletHidden ? { hidden: mobileHidden } : undefined,
  }
}

const isObj = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const objects = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value.filter(isObj) as T[]) : [])

function migrateWidget(w: BlockWidget): Widget | null {
  // Stored data only promises `version: 4` — anything below may be missing.
  if (!isObj(w.props) || typeof w.props.kind !== 'string') return null
  const mapped = widgetContent(w)
  if (!mapped) return null
  const vis = visibilityLayers(w)
  const base = stripUndefined<NodeStyle>({
    ...mapped.style,
    ...widthStyle(w.width),
    align: mapped.style.width !== undefined || widthStyle(w.width).width ? ALIGN[w.alignment] : undefined,
    textAlign: mapped.style.textAlign ?? w.alignment,
    margin: w.margin && (w.margin.top || w.margin.bottom) ? { top: w.margin.top, right: 0, bottom: w.margin.bottom, left: 0 } : undefined,
    padding: mapped.style.padding ?? (w.padding && Object.values(w.padding).some(Boolean) ? { ...w.padding } : undefined),
    background: mapped.style.background ?? blockBackground(w.background),
    hidden: vis.hidden,
  })
  const tablet = stripUndefined({ ...overrideStyle(w.responsiveOverrides?.tablet), ...vis.tablet })
  const mobile = stripUndefined({ ...overrideStyle(w.responsiveOverrides?.mobile), ...vis.mobile })
  const animationType = ANIMATION[w.animation?.type ?? 'none']
  return {
    id: newId(),
    kind: mapped.content.kind,
    content: mapped.content,
    style: base,
    ...(Object.keys(tablet).length ? { tablet } : {}),
    ...(Object.keys(mobile).length ? { mobile } : {}),
    ...(animationType
      ? { animation: { type: animationType, duration: num(w.animation.duration) ?? 600, delay: num(w.animation.delay) ?? 0 } }
      : {}),
  }
}

function migrateColumn(c: BlockColumn): Column {
  const s = c.settings
  return {
    id: newId(),
    style: stripUndefined<NodeStyle>({
      width: num(c.width) && c.width > 0 ? Math.min(100, c.width) : 100,
      verticalAlign: VALIGN[s?.verticalAlign ?? 'top'],
      textAlign: s?.horizontalAlign && s.horizontalAlign !== 'left' ? s.horizontalAlign : undefined,
      padding: s?.padding && Object.values(s.padding).some(Boolean) ? { ...s.padding } : undefined,
      background: blockBackground(s?.background),
      radius: num(s?.borderRadius) || undefined,
    }),
    widgets: objects<BlockWidget>(c.widgets).map(migrateWidget).filter((w): w is Widget => w !== null),
  }
}

function migrateSection(s: BlockSection, fallbackBg: Background | undefined): Section {
  const st = s.settings
  const background = sectionBackground(st?.background) ?? fallbackBg
  return {
    id: newId(),
    label: s.label || 'Section',
    style: stripUndefined<NodeStyle>({
      padding: st?.padding ? { ...st.padding } : undefined,
      margin: st?.margin && (st.margin.top || st.margin.bottom) ? { top: st.margin.top, right: 0, bottom: st.margin.bottom, left: 0 } : undefined,
      minHeight: num(st?.minHeight) || undefined,
      contentWidth: num(st?.contentWidth) ?? 0,
      background,
      gap: 0,
      verticalAlign: 'center',
    }),
    mobile: { stack: true },
    columns: objects<BlockColumn>(s.columns).map(migrateColumn),
  }
}

export function isV4Design(value: unknown): value is HeroBlockDesign {
  return !!value && typeof value === 'object' && (value as { version?: unknown }).version === 4
}

export function migrateV4Design(v4: HeroBlockDesign): HeroDesignV5 {
  const bgColor = color(v4.globalStyles?.backgroundColor)
  const fallbackBg: Background | undefined = bgColor && bgColor !== 'transparent' ? { type: 'color', color: bgColor } : undefined
  const sections = objects<BlockSection>(v4.sections)
    .map((s) => migrateSection(s, fallbackBg))
    .filter((s) => s.columns.length > 0)
  const globalImage = safeMediaUrl(v4.globalStyles?.backgroundImage)
  if (globalImage && sections[0] && !sections[0].style.background) {
    sections[0] = {
      ...sections[0],
      style: { ...sections[0].style, background: { type: 'image', image: { url: globalImage, size: 'cover', position: 'center' } } },
    }
  }
  return { version: 5, theme: { ...DEFAULT_THEME, colors: {} }, sections }
}
