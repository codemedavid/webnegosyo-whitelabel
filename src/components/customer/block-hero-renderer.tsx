'use client'

import { useState, useEffect, memo } from 'react'
import { motion } from 'framer-motion'
import {
  Star,
  Heart,
  ShoppingCart,
  Users,
  Award,
  Coffee,
  MapPin,
  Phone,
  Mail,
  Clock,
  Utensils,
  Gift,
  Zap,
  Flame,
  ThumbsUp,
  MessageCircle,
  Camera,
  Music,
  Sun,
  Moon,
  Cloud,
  Umbrella,
  Truck,
  CreditCard,
} from 'lucide-react'
import {
  getActiveWidgetProps,
  getActiveSectionSettings,
  getActiveColumnSettings,
} from '@/lib/hero-block-defaults'
import type {
  HeroBlockDesign,
  Breakpoint,
  BlockSection,
  BlockColumn,
  BlockWidget,
  BlockBackground,
  WidgetProps,
  TextWidgetProps,
  ImageWidgetProps,
  ButtonWidgetProps,
  ShapeWidgetProps,
  DividerWidgetProps,
  SpacerWidgetProps,
  IconWidgetProps,
  VideoWidgetProps,
  CountdownWidgetProps,
  SocialProofWidgetProps,
  AnimatedBgWidgetProps,
  ElementAnimation,
  SpacingValue,
  MarginValue,
  SectionSettings,
} from '@/types/hero-block-designer'

// ---------------------------------------------------------------------------
// Icon map — Lucide icons with Star as fallback
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  Star,
  Heart,
  ShoppingCart,
  Users,
  Award,
  Coffee,
  MapPin,
  Phone,
  Mail,
  Clock,
  Utensils,
  Gift,
  Zap,
  Flame,
  ThumbsUp,
  MessageCircle,
  Camera,
  Music,
  Sun,
  Moon,
  Cloud,
  Umbrella,
  Truck,
  CreditCard,
}

function getIcon(name: string): React.ComponentType<{ size?: number; color?: string }> {
  return ICON_MAP[name] ?? Star
}

// ---------------------------------------------------------------------------
// Animation helpers
// ---------------------------------------------------------------------------

function getInitialState(type: ElementAnimation['type']): Record<string, number> {
  switch (type) {
    case 'fadeIn':
      return { opacity: 0 }
    case 'slideUp':
      return { opacity: 0, y: 30 }
    case 'slideDown':
      return { opacity: 0, y: -30 }
    case 'slideLeft':
      return { opacity: 0, x: 30 }
    case 'slideRight':
      return { opacity: 0, x: -30 }
    case 'scaleIn':
      return { opacity: 0, scale: 0.8 }
    case 'bounce':
      return { opacity: 0, y: 30 }
    default:
      return {}
  }
}

const VISIBLE_STATE = { opacity: 1, x: 0, y: 0, scale: 1 }

// ---------------------------------------------------------------------------
// Responsive widget layout resolution
// ---------------------------------------------------------------------------

interface ResolvedWidgetLayout {
  alignment: 'left' | 'center' | 'right'
  width: string
  margin: MarginValue
  padding: SpacingValue
}

function getActiveWidgetLayout(widget: BlockWidget, breakpoint: Breakpoint): ResolvedWidgetLayout {
  const base: ResolvedWidgetLayout = {
    alignment: widget.alignment,
    width: widget.width,
    margin: widget.margin,
    padding: widget.padding,
  }

  if (breakpoint === 'desktop') {
    return base
  }

  const overrides = widget.responsiveOverrides

  if (breakpoint === 'tablet') {
    const tabletOverride = overrides?.tablet
    if (tabletOverride) {
      return {
        alignment: tabletOverride.alignment ?? base.alignment,
        width: tabletOverride.width ?? base.width,
        margin: tabletOverride.margin ?? base.margin,
        padding: tabletOverride.padding ?? base.padding,
      }
    }
    return base
  }

  // mobile: try mobile, then tablet, then base
  const mobileOverride = overrides?.mobile
  if (mobileOverride) {
    return {
      alignment: mobileOverride.alignment ?? base.alignment,
      width: mobileOverride.width ?? base.width,
      margin: mobileOverride.margin ?? base.margin,
      padding: mobileOverride.padding ?? base.padding,
    }
  }

  const tabletOverride = overrides?.tablet
  if (tabletOverride) {
    return {
      alignment: tabletOverride.alignment ?? base.alignment,
      width: tabletOverride.width ?? base.width,
      margin: tabletOverride.margin ?? base.margin,
      padding: tabletOverride.padding ?? base.padding,
    }
  }

  return base
}

// ---------------------------------------------------------------------------
// Block background style resolver (columns & widgets)
// ---------------------------------------------------------------------------

function resolveBlockBackgroundStyles(bg: BlockBackground): React.CSSProperties {
  switch (bg.type) {
    case 'color':
      return { backgroundColor: bg.color || undefined }
    case 'image':
      if (!bg.image?.url) return {}
      return {
        backgroundImage: `url(${bg.image.url})`,
        backgroundSize: bg.image.objectFit === 'fill' ? '100% 100%' : bg.image.objectFit,
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        ...(bg.image.opacity < 1 ? { opacity: bg.image.opacity } : {}),
      }
    case 'gradient':
      return { backgroundImage: bg.gradient || undefined }
    default:
      return {}
  }
}

// ---------------------------------------------------------------------------
// Widget sub-renderers
// ---------------------------------------------------------------------------

function RenderText({ props }: { props: TextWidgetProps }) {
  return (
    <div
      style={{
        fontFamily: props.fontFamily,
        fontSize: props.fontSize,
        fontWeight: props.bold ? 700 : props.fontWeight,
        lineHeight: props.lineHeight,
        letterSpacing: props.letterSpacing,
        color: props.color,
        textAlign: props.textAlign,
        textShadow: props.textShadow || undefined,
        fontStyle: props.italic ? 'italic' : undefined,
        textDecoration: props.underline ? 'underline' : undefined,
        width: '100%',
      }}
    >
      {props.content}
    </div>
  )
}

function RenderImage({ props }: { props: ImageWidgetProps }) {
  if (!props.src) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={props.src}
      alt={props.alt}
      loading="lazy"
      style={{
        width: props.width ? `${props.width}px` : '100%',
        height: props.height ? `${props.height}px` : 'auto',
        objectFit: props.objectFit,
        borderRadius: props.borderRadius,
        opacity: props.opacity,
        display: 'block',
      }}
    />
  )
}

function RenderButton({ props }: { props: ButtonWidgetProps }) {
  const sharedStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: props.backgroundColor,
    color: props.textColor,
    borderWidth: props.borderWidth,
    borderColor: props.borderColor,
    borderStyle: 'solid',
    borderRadius: props.borderRadius,
    fontSize: props.fontSize,
    fontWeight: props.fontWeight,
    padding: '12px 24px',
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  }

  const hoverClass =
    props.hoverEffect === 'darken'
      ? 'hover:brightness-90'
      : props.hoverEffect === 'lighten'
        ? 'hover:brightness-110'
        : props.hoverEffect === 'scale'
          ? 'hover:scale-105'
          : ''

  if (props.linkUrl) {
    return (
      <a
        href={props.linkUrl}
        target={props.linkTarget}
        rel={props.linkTarget === '_blank' ? 'noopener noreferrer' : undefined}
        className={`inline-flex transition-all ${hoverClass}`}
        style={sharedStyle}
      >
        {props.text}
      </a>
    )
  }

  return (
    <button
      type="button"
      className={`transition-all ${hoverClass}`}
      style={sharedStyle}
    >
      {props.text}
    </button>
  )
}

function RenderShape({ props }: { props: ShapeWidgetProps }) {
  return (
    <div
      style={{
        width: '100%',
        backgroundColor: props.fillColor,
        borderWidth: props.borderWidth,
        borderColor: props.borderColor,
        borderStyle: 'solid',
        borderRadius: props.shapeType === 'circle' ? '50%' : props.borderRadius,
        opacity: props.opacity,
        minHeight: 20,
      }}
    />
  )
}

function RenderDivider({ props }: { props: DividerWidgetProps }) {
  if (props.orientation === 'horizontal') {
    return (
      <hr
        style={{
          width: '100%',
          border: 'none',
          borderTopWidth: props.thickness,
          borderTopColor: props.color,
          borderTopStyle: props.style,
          margin: 0,
        }}
      />
    )
  }
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      style={{
        height: '100%',
        borderLeftWidth: props.thickness,
        borderLeftColor: props.color,
        borderLeftStyle: props.style,
      }}
    />
  )
}

function RenderSpacer({ props }: { props: SpacerWidgetProps }) {
  return <div style={{ height: props.height }} aria-hidden="true" />
}

const RenderIcon = memo(function RenderIcon({ props }: { props: IconWidgetProps }) {
  const IconComponent = getIcon(props.iconName)
  return <IconComponent size={props.size} color={props.color} />
})

function RenderVideo({ props }: { props: VideoWidgetProps }) {
  if (!props.videoUrl) return null
  return (
    <video
      src={props.videoUrl}
      autoPlay={props.autoplay}
      muted={props.muted}
      loop={props.loop}
      playsInline
      poster={props.posterImage || undefined}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  )
}

function RenderCountdown({ props }: { props: CountdownWidgetProps }) {
  // Start as null so the first client render matches the (time-stale, ISR-cached)
  // server HTML — reading Date.now() during render would diverge and trigger a
  // hydration mismatch. We adopt the live clock only after mount.
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const target = new Date(props.targetDate).getTime()
  // Before mount (server + first client render) show zeros so both sides agree.
  const diff = now === null ? 0 : Math.max(0, target - now)

  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff % 86_400_000) / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  const seconds = Math.floor((diff % 60_000) / 1000)

  const segments: { label: string; value: number }[] = []
  if (props.showDays) segments.push({ label: 'D', value: days })
  if (props.showHours) segments.push({ label: 'H', value: hours })
  if (props.showMinutes) segments.push({ label: 'M', value: minutes })
  if (props.showSeconds) segments.push({ label: 'S', value: seconds })

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: props.fontSize,
        color: props.color,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {segments.map((seg, i) => (
        <span key={seg.label} style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
          {i > 0 && (
            <span style={{ color: props.separatorColor, margin: '0 4px' }}>:</span>
          )}
          <span style={{ fontWeight: 700 }}>
            {String(seg.value).padStart(2, '0')}
          </span>
          <span style={{ fontSize: '0.6em', opacity: 0.7 }}>{seg.label}</span>
        </span>
      ))}
    </div>
  )
}

function RenderSocialProof({ props }: { props: SocialProofWidgetProps }) {
  const IconComponent = getIcon(props.iconName)
  const radiusMap: Record<string, string> = {
    pill: '9999px',
    rounded: '8px',
    square: '0px',
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        backgroundColor: props.backgroundColor,
        color: props.textColor,
        borderRadius: radiusMap[props.badgeStyle] ?? '8px',
        padding: '6px 14px',
        fontSize: 14,
        fontWeight: 600,
      }}
    >
      <IconComponent size={16} color={props.textColor} />
      <span>{props.number.toLocaleString()}</span>
      <span>{props.text}</span>
    </div>
  )
}

function RenderAnimatedBg({ props }: { props: AnimatedBgWidgetProps }) {
  let background: string | undefined

  if (props.gradientType === 'linear' && props.gradientColors.length >= 2) {
    background = `linear-gradient(${props.gradientAngle}deg, ${props.gradientColors.join(', ')})`
  } else if (props.gradientType === 'radial' && props.gradientColors.length >= 2) {
    background = `radial-gradient(circle, ${props.gradientColors.join(', ')})`
  }

  let patternBg: string | undefined
  if (props.patternType === 'dots') {
    patternBg = 'radial-gradient(circle, currentColor 1px, transparent 1px)'
  } else if (props.patternType === 'lines') {
    patternBg =
      'repeating-linear-gradient(0deg, currentColor 0px, currentColor 1px, transparent 1px, transparent 10px)'
  } else if (props.patternType === 'grid') {
    patternBg = [
      'repeating-linear-gradient(0deg, currentColor 0px, currentColor 1px, transparent 1px, transparent 20px)',
      'repeating-linear-gradient(90deg, currentColor 0px, currentColor 1px, transparent 1px, transparent 20px)',
    ].join(', ')
  }

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: 100 }} aria-hidden="true">
      {background && (
        <div style={{ position: 'absolute', inset: 0, background }} />
      )}
      {patternBg && props.patternType !== 'none' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: patternBg,
            backgroundSize: props.patternType === 'dots' ? '10px 10px' : undefined,
            opacity: props.patternOpacity,
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Widget content dispatcher
// ---------------------------------------------------------------------------

function WidgetContent({ props }: { props: WidgetProps }) {
  switch (props.kind) {
    case 'text':
      return <RenderText props={props} />
    case 'image':
      return <RenderImage props={props} />
    case 'button':
      return <RenderButton props={props} />
    case 'shape':
      return <RenderShape props={props} />
    case 'divider':
      return <RenderDivider props={props} />
    case 'spacer':
      return <RenderSpacer props={props} />
    case 'icon':
      return <RenderIcon props={props} />
    case 'video':
      return <RenderVideo props={props} />
    case 'countdown':
      return <RenderCountdown props={props} />
    case 'social-proof':
      return <RenderSocialProof props={props} />
    case 'animated-bg':
      return <RenderAnimatedBg props={props} />
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Widget wrapper (layout + animation)
// ---------------------------------------------------------------------------

function WidgetWrapper({
  widget,
  breakpoint,
}: {
  widget: BlockWidget
  breakpoint: Breakpoint
}) {
  // Skip if not visible for this breakpoint
  if (!widget.visibility[breakpoint]) return null

  const resolvedProps = getActiveWidgetProps(widget, breakpoint)
  const layout = getActiveWidgetLayout(widget, breakpoint)

  const alignSelfMap: Record<string, string> = {
    left: 'flex-start',
    center: 'center',
    right: 'flex-end',
  }

  let widthValue: string | undefined
  if (layout.width === 'full') {
    widthValue = '100%'
  } else if (layout.width === 'auto') {
    widthValue = 'auto'
  } else {
    // Assume percentage string like "50"
    widthValue = `${layout.width}%`
  }

  const bgStyles = widget.background ? resolveBlockBackgroundStyles(widget.background) : {}

  const wrapperStyle: React.CSSProperties = {
    alignSelf: alignSelfMap[layout.alignment] ?? 'center',
    width: widthValue,
    marginTop: layout.margin.top,
    marginBottom: layout.margin.bottom,
    paddingTop: layout.padding.top,
    paddingRight: layout.padding.right,
    paddingBottom: layout.padding.bottom,
    paddingLeft: layout.padding.left,
    ...bgStyles,
  }

  const anim = widget.animation

  if (anim.type === 'none') {
    return (
      <div style={wrapperStyle}>
        <WidgetContent props={resolvedProps} />
      </div>
    )
  }

  const initial = getInitialState(anim.type)
  const transition: Record<string, unknown> = {
    duration: anim.duration / 1000,
    delay: anim.delay / 1000,
  }
  if (anim.type === 'bounce') {
    transition.type = 'spring' as const
  }

  return (
    <motion.div
      style={wrapperStyle}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={{
        hidden: initial,
        visible: VISIBLE_STATE,
      }}
      transition={transition}
    >
      <WidgetContent props={resolvedProps} />
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Column renderer
// ---------------------------------------------------------------------------

function ColumnRenderer({
  column,
  breakpoint,
}: {
  column: BlockColumn
  breakpoint: Breakpoint
}) {
  const settings = getActiveColumnSettings(column, breakpoint)

  const justifyMap: Record<string, string> = {
    top: 'flex-start',
    center: 'center',
    bottom: 'flex-end',
  }

  const alignMap: Record<string, string> = {
    left: 'flex-start',
    center: 'center',
    right: 'flex-end',
  }

  const bgStyles = settings.background && typeof settings.background === 'object'
    ? resolveBlockBackgroundStyles(settings.background)
    : {}

  const columnStyle: React.CSSProperties = {
    flex: column.width,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: justifyMap[settings.verticalAlign] ?? 'flex-start',
    alignItems: alignMap[settings.horizontalAlign] ?? 'flex-start',
    paddingTop: settings.padding.top,
    paddingRight: settings.padding.right,
    paddingBottom: settings.padding.bottom,
    paddingLeft: settings.padding.left,
    ...bgStyles,
    borderRadius: settings.borderRadius > 0 ? settings.borderRadius : undefined,
  }

  return (
    <div style={columnStyle}>
      {column.widgets.map((widget) => (
        <WidgetWrapper key={widget.id} widget={widget} breakpoint={breakpoint} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section background renderer
// ---------------------------------------------------------------------------

function SectionBackgroundLayer({ settings }: { settings: SectionSettings }) {
  const bg = settings.background

  switch (bg.type) {
    case 'color':
      return null // color is applied directly on the section element
    case 'image':
      if (!bg.image) return null
      return (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${bg.image})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            zIndex: 0,
          }}
        />
      )
    case 'gradient':
      if (!bg.gradient) return null
      return (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: bg.gradient,
            zIndex: 0,
          }}
        />
      )
    case 'video':
      if (!bg.video) return null
      return (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            zIndex: 0,
          }}
        >
          <video
            src={bg.video}
            autoPlay
            muted
            loop
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        </div>
      )
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Section renderer
// ---------------------------------------------------------------------------

function SectionRenderer({
  section,
  breakpoint,
  maxWidth,
}: {
  section: BlockSection
  breakpoint: Breakpoint
  maxWidth: number
}) {
  const settings = getActiveSectionSettings(section, breakpoint)
  const hasOverlay =
    settings.background.type === 'image' ||
    settings.background.type === 'gradient' ||
    settings.background.type === 'video'

  const sectionStyle: React.CSSProperties = {
    position: hasOverlay ? 'relative' : undefined,
    overflow: hasOverlay ? 'hidden' : undefined,
    backgroundColor:
      settings.background.type === 'color' && settings.background.color !== 'none'
        ? settings.background.color
        : undefined,
    paddingTop: settings.padding.top,
    paddingRight: settings.padding.right,
    paddingBottom: settings.padding.bottom,
    paddingLeft: settings.padding.left,
    marginTop: settings.margin.top > 0 ? settings.margin.top : undefined,
    marginBottom: settings.margin.bottom > 0 ? settings.margin.bottom : undefined,
    minHeight: settings.minHeight > 0 ? settings.minHeight : undefined,
    contain: 'layout style paint',
  }

  const isBoxed = settings.contentWidth > 0

  const innerStyle: React.CSSProperties = isBoxed
    ? {
        maxWidth: settings.contentWidth || maxWidth,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        position: hasOverlay ? 'relative' : undefined,
        zIndex: hasOverlay ? 1 : undefined,
      }
    : {
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        position: hasOverlay ? 'relative' : undefined,
        zIndex: hasOverlay ? 1 : undefined,
      }

  return (
    <section style={sectionStyle}>
      {hasOverlay && <SectionBackgroundLayer settings={settings} />}
      <div style={innerStyle}>
        {section.columns.map((column) => (
          <ColumnRenderer key={column.id} column={column} breakpoint={breakpoint} />
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// BreakpointView — renders the entire design for a single breakpoint
// ---------------------------------------------------------------------------

function BreakpointView({
  design,
  breakpoint,
  className,
}: {
  design: HeroBlockDesign
  breakpoint: Breakpoint
  className?: string
}) {
  const containerStyle: React.CSSProperties = {
    backgroundColor: design.globalStyles.backgroundColor,
    position: 'relative',
    width: '100%',
  }

  const maxWidth = design.globalStyles.maxWidth ?? 1200

  return (
    <div className={className} style={containerStyle}>
      {design.globalStyles.backgroundImage && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${design.globalStyles.backgroundImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />
      )}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {design.sections.map((section) => (
          <SectionRenderer
            key={section.id}
            section={section}
            breakpoint={breakpoint}
            maxWidth={maxWidth}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BlockHeroRenderer — public export
// ---------------------------------------------------------------------------

interface BlockHeroRendererProps {
  design: HeroBlockDesign
  className?: string
}

export function BlockHeroRenderer({ design, className }: BlockHeroRendererProps) {
  if (!design.sections.length) return null

  return (
    <div className={className}>
      {/* Desktop */}
      <BreakpointView
        design={design}
        breakpoint="desktop"
        className="hidden lg:block"
      />
      {/* Tablet */}
      <BreakpointView
        design={design}
        breakpoint="tablet"
        className="hidden md:block lg:hidden"
      />
      {/* Mobile */}
      <BreakpointView
        design={design}
        breakpoint="mobile"
        className="block md:hidden"
      />
    </div>
  )
}
