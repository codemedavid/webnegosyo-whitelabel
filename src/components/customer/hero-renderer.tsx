'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Star,
  ShoppingCart,
  Heart,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Menu,
  X,
  Search,
  Phone,
  Mail,
  MapPin,
  Clock,
  Users,
  Truck,
  Gift,
  Flame,
  Zap,
} from 'lucide-react'
import type {
  HeroDesign,
  HeroElement,
  ElementLayout,
  ElementAnimation,
  TextProps,
  ImageProps,
  ButtonProps,
  ShapeProps,
  DividerProps,
  IconProps,
  VideoProps,
  CountdownProps,
  SocialProofProps,
  AnimatedBgProps,
} from '@/types/hero-designer'

// ---------------------------------------------------------------------------
// Icon map — common Lucide icons with Star as fallback
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  star: Star,
  'shopping-cart': ShoppingCart,
  heart: Heart,
  'arrow-right': ArrowRight,
  'arrow-left': ArrowLeft,
  'chevron-right': ChevronRight,
  'chevron-left': ChevronLeft,
  'chevron-down': ChevronDown,
  'chevron-up': ChevronUp,
  menu: Menu,
  x: X,
  search: Search,
  phone: Phone,
  mail: Mail,
  'map-pin': MapPin,
  clock: Clock,
  users: Users,
  truck: Truck,
  gift: Gift,
  flame: Flame,
  zap: Zap,
}

// ---------------------------------------------------------------------------
// Animation helpers
// ---------------------------------------------------------------------------

const ANIMATION_INITIAL: Record<string, Record<string, number>> = {
  fadeIn: { opacity: 0 },
  slideUp: { y: 20, opacity: 0 },
  slideDown: { y: -20, opacity: 0 },
  slideLeft: { x: 20, opacity: 0 },
  slideRight: { x: -20, opacity: 0 },
  scaleIn: { scale: 0.8, opacity: 0 },
  bounce: { y: -10, opacity: 0 },
}

const ANIMATION_FINAL: Record<string, Record<string, number>> = {
  fadeIn: { opacity: 1 },
  slideUp: { y: 0, opacity: 1 },
  slideDown: { y: 0, opacity: 1 },
  slideLeft: { x: 0, opacity: 1 },
  slideRight: { x: 0, opacity: 1 },
  scaleIn: { scale: 1, opacity: 1 },
  bounce: { y: 0, opacity: 1 },
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HeroRendererProps {
  design: HeroDesign
  className?: string
}

// ---------------------------------------------------------------------------
// Sub-renderers
// ---------------------------------------------------------------------------

function RenderText({ props }: { props: TextProps }) {
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
        height: '100%',
      }}
    >
      {props.content}
    </div>
  )
}

function RenderImage({ props }: { props: ImageProps }) {
  if (!props.src) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={props.src}
      alt={props.alt}
      style={{
        width: '100%',
        height: '100%',
        objectFit: props.objectFit,
        borderRadius: props.borderRadius,
        opacity: props.opacity,
      }}
    />
  )
}

function RenderButton({ props }: { props: ButtonProps }) {
  return (
    <a
      href={props.linkUrl}
      target={props.linkTarget}
      rel={props.linkTarget === '_blank' ? 'noopener noreferrer' : undefined}
      className="hero-button"
      style={{
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
        padding: '8px 24px',
        textDecoration: 'none',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        width: '100%',
        height: '100%',
      }}
    >
      {props.text}
    </a>
  )
}

function RenderShape({ props }: { props: ShapeProps }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: props.fillColor,
        borderWidth: props.borderWidth,
        borderColor: props.borderColor,
        borderStyle: 'solid',
        borderRadius: props.shapeType === 'circle' ? '50%' : props.borderRadius,
        opacity: props.opacity,
      }}
    />
  )
}

function RenderDivider({ props }: { props: DividerProps }) {
  if (props.orientation === 'horizontal') {
    return (
      <div
        style={{
          width: '100%',
          borderTopWidth: props.thickness,
          borderTopColor: props.color,
          borderTopStyle: props.style,
        }}
      />
    )
  }
  return (
    <div
      style={{
        height: '100%',
        borderLeftWidth: props.thickness,
        borderLeftColor: props.color,
        borderLeftStyle: props.style,
      }}
    />
  )
}

function RenderIcon({ props }: { props: IconProps }) {
  const IconComponent = ICON_MAP[props.iconName] ?? Star
  return <IconComponent size={props.size} color={props.color} />
}

function isEmbedUrl(url: string): boolean {
  return url.includes('youtube.com') || url.includes('youtu.be') || url.includes('vimeo.com')
}

function toEmbedUrl(url: string): string {
  // YouTube
  const ytMatch = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/
  )
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&mute=1`
  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/)
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1&muted=1`
  return url
}

function RenderVideo({ props }: { props: VideoProps }) {
  if (!props.videoUrl) return null

  if (isEmbedUrl(props.videoUrl)) {
    return (
      <iframe
        src={toEmbedUrl(props.videoUrl)}
        style={{ width: '100%', height: '100%', border: 'none' }}
        allow="autoplay; encrypted-media"
        allowFullScreen
      />
    )
  }

  return (
    <video
      src={props.videoUrl}
      autoPlay={props.autoplay}
      muted={props.muted}
      loop={props.loop}
      poster={props.posterImage || undefined}
      playsInline
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  )
}

function RenderCountdown({ props }: { props: CountdownProps }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const target = new Date(props.targetDate).getTime()
  const diff = Math.max(0, target - now)

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

function RenderSocialProof({ props }: { props: SocialProofProps }) {
  const IconComponent = ICON_MAP[props.iconName] ?? Star
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

function RenderAnimatedBg({ props }: { props: AnimatedBgProps }) {
  let background: string | undefined

  if (props.gradientType === 'linear' && props.gradientColors.length >= 2) {
    background = `linear-gradient(${props.gradientAngle}deg, ${props.gradientColors.join(', ')})`
  } else if (props.gradientType === 'radial' && props.gradientColors.length >= 2) {
    background = `radial-gradient(circle, ${props.gradientColors.join(', ')})`
  }

  let patternBg: string | undefined
  if (props.patternType === 'dots') {
    patternBg = `radial-gradient(circle, currentColor 1px, transparent 1px)`
  } else if (props.patternType === 'lines') {
    patternBg = `repeating-linear-gradient(0deg, currentColor 0px, currentColor 1px, transparent 1px, transparent 10px)`
  } else if (props.patternType === 'grid') {
    patternBg = `
      repeating-linear-gradient(0deg, currentColor 0px, currentColor 1px, transparent 1px, transparent 20px),
      repeating-linear-gradient(90deg, currentColor 0px, currentColor 1px, transparent 1px, transparent 20px)
    `
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
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
// Element content dispatcher
// ---------------------------------------------------------------------------

function ElementContent({ element }: { element: HeroElement }) {
  const p = element.props
  switch (p.kind) {
    case 'text':
      return <RenderText props={p} />
    case 'image':
      return <RenderImage props={p} />
    case 'button':
      return <RenderButton props={p} />
    case 'shape':
      return <RenderShape props={p} />
    case 'divider':
      return <RenderDivider props={p} />
    case 'icon':
      return <RenderIcon props={p} />
    case 'video':
      return <RenderVideo props={p} />
    case 'countdown':
      return <RenderCountdown props={p} />
    case 'social-proof':
      return <RenderSocialProof props={p} />
    case 'animated-bg':
      return <RenderAnimatedBg props={p} />
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Element wrapper (positioning + animation)
// ---------------------------------------------------------------------------

function PositionedElement({
  element,
  layout,
}: {
  element: HeroElement
  layout: ElementLayout
}) {
  const anim = element.animation

  const positionStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${layout.x}%`,
    top: `${layout.y}%`,
    width: layout.width === -1 ? 'auto' : `${layout.width}%`,
    height: layout.height === -1 ? 'auto' : `${layout.height}%`,
    transform: layout.rotation !== 0 ? `rotate(${layout.rotation}deg)` : undefined,
    padding: `${layout.padding.top}px ${layout.padding.right}px ${layout.padding.bottom}px ${layout.padding.left}px`,
    zIndex: element.zIndex,
  }

  if (anim.type === 'none') {
    return (
      <div style={positionStyle}>
        <ElementContent element={element} />
      </div>
    )
  }

  return (
    <motion.div
      style={positionStyle}
      initial={ANIMATION_INITIAL[anim.type]}
      animate={ANIMATION_FINAL[anim.type]}
      transition={{
        duration: anim.duration / 1000,
        delay: anim.delay / 1000,
        ...(anim.type === 'bounce' ? { type: 'spring' as const } : {}),
      }}
    >
      <ElementContent element={element} />
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Canvas renderer (shared by desktop/mobile)
// ---------------------------------------------------------------------------

function CanvasView({
  design,
  breakpoint,
}: {
  design: HeroDesign
  breakpoint: 'desktop' | 'mobile'
}) {
  const height = design.canvas[breakpoint].height

  const sortedElements = useMemo(() => {
    return [...design.elements]
      .filter((el) => el.visible !== false)
      .sort((a, b) => a.zIndex - b.zIndex)
  }, [design.elements])

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height,
        backgroundColor: design.backgroundColor,
        overflow: 'hidden',
      }}
    >
      {/* Background image */}
      {design.backgroundImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={design.backgroundImage.url}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: design.backgroundImage.objectFit,
            opacity: design.backgroundImage.opacity,
          }}
        />
      )}

      {/* Elements */}
      {sortedElements.map((element) => (
        <PositionedElement
          key={element.id}
          element={element}
          layout={element[breakpoint]}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function HeroRenderer({ design, className }: HeroRendererProps) {
  return (
    <div
      className={className}
      style={{ contain: 'layout style paint', position: 'relative' }}
    >
      {/* Desktop */}
      <div className="hidden md:block">
        <CanvasView design={design} breakpoint="desktop" />
      </div>

      {/* Mobile */}
      <div className="block md:hidden">
        <CanvasView design={design} breakpoint="mobile" />
      </div>
    </div>
  )
}
