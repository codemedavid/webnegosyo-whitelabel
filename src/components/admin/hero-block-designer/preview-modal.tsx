'use client'

import { useCallback, useEffect, useState } from 'react'
import { Monitor, Smartphone, Tablet, X } from 'lucide-react'

import type {
  Breakpoint,
  HeroBlockDesign,
  TextWidgetProps,
  ButtonWidgetProps,
  ImageWidgetProps,
  SpacerWidgetProps,
  DividerWidgetProps,
  ShapeWidgetProps,
  IconWidgetProps,
  VideoWidgetProps,
  CountdownWidgetProps,
  SocialProofWidgetProps,
  AnimatedBgWidgetProps,
  BlockWidget,
  BlockColumn,
  BlockSection,
  BlockBackground,
  SectionBackground,
} from '@/types/hero-block-designer'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BlockPreviewModalProps {
  design: HeroBlockDesign
  isOpen: boolean
  onClose: () => void
}

interface DeviceOption {
  id: Breakpoint
  label: string
  icon: typeof Monitor
  width: number
}

const DEVICES: DeviceOption[] = [
  { id: 'desktop', label: 'Desktop', icon: Monitor, width: 1440 },
  { id: 'tablet', label: 'Tablet', icon: Tablet, width: 768 },
  { id: 'mobile', label: 'Mobile', icon: Smartphone, width: 390 },
]

// ---------------------------------------------------------------------------
// Static widget renderer (no selection/hover/insertion UI)
// ---------------------------------------------------------------------------

function StaticWidget({ widget }: { widget: BlockWidget }) {
  const { props } = widget

  switch (props.kind) {
    case 'text': {
      const p = props as TextWidgetProps
      return (
        <div
          style={{
            fontFamily: p.fontFamily,
            fontSize: p.fontSize,
            fontWeight: p.fontWeight,
            lineHeight: p.lineHeight,
            letterSpacing: p.letterSpacing,
            color: p.color,
            textAlign: p.textAlign,
            textShadow: p.textShadow || undefined,
            fontStyle: p.italic ? 'italic' : undefined,
            textDecoration: p.underline ? 'underline' : undefined,
            width: '100%',
          }}
        >
          {p.content}
        </div>
      )
    }

    case 'image': {
      const p = props as ImageWidgetProps
      if (!p.src) {
        return (
          <div className="flex h-32 w-full items-center justify-center rounded bg-gray-100 text-sm text-gray-400">
            Image placeholder
          </div>
        )
      }
      return (
        <>
          {/* Preview renders arbitrary admin-selected asset URLs and intentionally skips Next image optimization. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.src}
            alt={p.alt}
            style={{
              objectFit: p.objectFit,
              borderRadius: p.borderRadius,
              opacity: p.opacity,
              width: '100%',
            }}
          />
        </>
      )
    }

    case 'button': {
      const p = props as ButtonWidgetProps
      return (
        <button
          style={{
            backgroundColor: p.backgroundColor,
            color: p.textColor,
            borderWidth: p.borderWidth,
            borderColor: p.borderColor,
            borderStyle: 'solid',
            borderRadius: p.borderRadius,
            fontSize: p.fontSize,
            fontWeight: p.fontWeight,
            padding: '10px 24px',
            cursor: 'pointer',
          }}
        >
          {p.text}
        </button>
      )
    }

    case 'spacer': {
      const p = props as SpacerWidgetProps
      return <div style={{ height: p.height }} />
    }

    case 'divider': {
      const p = props as DividerWidgetProps
      if (p.orientation === 'vertical') {
        return (
          <div
            style={{
              width: p.thickness,
              height: '100%',
              minHeight: 40,
              backgroundColor: p.color,
              borderStyle: p.style,
            }}
          />
        )
      }
      return (
        <hr
          style={{
            borderTopWidth: p.thickness,
            borderTopColor: p.color,
            borderTopStyle: p.style,
            width: '100%',
            margin: 0,
          }}
        />
      )
    }

    case 'shape': {
      const p = props as ShapeWidgetProps
      return (
        <div
          style={{
            width: '100%',
            height: 80,
            backgroundColor: p.fillColor,
            borderWidth: p.borderWidth,
            borderColor: p.borderColor,
            borderStyle: 'solid',
            borderRadius:
              p.shapeType === 'circle'
                ? '50%'
                : p.shapeType === 'rounded-rect'
                  ? p.borderRadius
                  : 0,
            opacity: p.opacity,
          }}
        />
      )
    }

    case 'icon': {
      const p = props as IconWidgetProps
      return (
        <div
          style={{
            fontSize: p.size,
            color: p.color,
            textAlign: 'center',
          }}
        >
          {p.iconName}
        </div>
      )
    }

    case 'video': {
      const p = props as VideoWidgetProps
      if (!p.videoUrl) {
        return (
          <div className="flex h-32 w-full items-center justify-center rounded bg-gray-800 text-sm text-gray-400">
            Video placeholder
          </div>
        )
      }
      return (
        <video
          src={p.videoUrl}
          autoPlay={p.autoplay}
          muted={p.muted}
          loop={p.loop}
          poster={p.posterImage || undefined}
          style={{ width: '100%', borderRadius: 4 }}
        />
      )
    }

    case 'countdown': {
      const p = props as CountdownWidgetProps
      return (
        <div
          style={{
            fontSize: p.fontSize,
            color: p.color,
            textAlign: 'center',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {p.showDays && <span>00d </span>}
          {p.showHours && <span>00h </span>}
          {p.showMinutes && <span>00m </span>}
          {p.showSeconds && <span>00s</span>}
        </div>
      )
    }

    case 'social-proof': {
      const p = props as SocialProofWidgetProps
      return (
        <div
          style={{
            backgroundColor: p.backgroundColor,
            color: p.textColor,
            padding: '8px 16px',
            borderRadius:
              p.badgeStyle === 'pill' ? 999 : p.badgeStyle === 'rounded' ? 8 : 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 14,
          }}
        >
          <strong>{p.number.toLocaleString()}</strong> {p.text}
        </div>
      )
    }

    case 'animated-bg': {
      const p = props as AnimatedBgWidgetProps
      const bg =
        p.gradientType === 'linear'
          ? `linear-gradient(${p.gradientAngle}deg, ${p.gradientColors.join(', ')})`
          : p.gradientType === 'radial'
            ? `radial-gradient(circle, ${p.gradientColors.join(', ')})`
            : 'transparent'
      return (
        <div
          style={{
            width: '100%',
            height: 120,
            background: bg,
            borderRadius: 4,
            opacity: p.patternOpacity,
          }}
        />
      )
    }

    default:
      return null
  }
}

function StaticColumn({ column }: { column: BlockColumn }) {
  const backgroundStyle = resolveBackgroundStyles(column.settings.background)

  return (
    <div
      style={{
        width: `${column.width}%`,
        display: 'flex',
        flexDirection: 'column',
        alignItems:
          column.settings.horizontalAlign === 'center'
            ? 'center'
            : column.settings.horizontalAlign === 'right'
              ? 'flex-end'
              : 'flex-start',
        justifyContent:
          column.settings.verticalAlign === 'center'
            ? 'center'
            : column.settings.verticalAlign === 'bottom'
              ? 'flex-end'
              : 'flex-start',
        padding: `${column.settings.padding.top}px ${column.settings.padding.right}px ${column.settings.padding.bottom}px ${column.settings.padding.left}px`,
        ...backgroundStyle,
        borderRadius: column.settings.borderRadius,
        gap: 8,
      }}
    >
      {column.widgets.map((widget) => (
        <div
          key={widget.id}
          style={{
            width: widget.width === 'full' ? '100%' : 'auto',
            display: 'flex',
            justifyContent:
              widget.alignment === 'center'
                ? 'center'
                : widget.alignment === 'right'
                  ? 'flex-end'
                  : 'flex-start',
            marginTop: widget.margin.top,
            marginBottom: widget.margin.bottom,
            paddingTop: widget.padding.top,
            paddingRight: widget.padding.right,
            paddingBottom: widget.padding.bottom,
            paddingLeft: widget.padding.left,
          }}
        >
          <StaticWidget widget={widget} />
        </div>
      ))}
    </div>
  )
}

function resolveBackgroundStyles(
  bg: BlockBackground | SectionBackground,
): React.CSSProperties {
  switch (bg.type) {
    case 'color':
      return bg.color && bg.color !== 'none'
        ? { backgroundColor: bg.color }
        : {}
    case 'gradient':
      return bg.gradient
        ? { backgroundImage: bg.gradient }
        : {}
    case 'image':
      if (!bg.image) {
        return {}
      }

      if (typeof bg.image === 'string') {
        return {
          backgroundImage: `url(${bg.image})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }
      }

      return {
        backgroundImage: `url(${bg.image.url})`,
        backgroundSize: bg.image.objectFit === 'fill' ? '100% 100%' : bg.image.objectFit,
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }
    case 'video':
      return { backgroundColor: '#1a1a2e' }
    default:
      return {}
  }
}

function StaticSection({ section }: { section: BlockSection }) {
  const backgroundStyle = resolveBackgroundStyles(section.settings.background)

  return (
    <div
      style={{
        ...backgroundStyle,
        minHeight: section.settings.minHeight || undefined,
        padding: `${section.settings.padding.top}px ${section.settings.padding.right}px ${section.settings.padding.bottom}px ${section.settings.padding.left}px`,
        marginTop: section.settings.margin.top,
        marginBottom: section.settings.margin.bottom,
      }}
    >
      <div
        style={{
          maxWidth: section.settings.contentWidth,
          margin: '0 auto',
          display: 'flex',
          gap: 0,
        }}
      >
        {section.columns.map((col) => (
          <StaticColumn key={col.id} column={col} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BlockPreviewModal({
  design,
  isOpen,
  onClose,
}: BlockPreviewModalProps) {
  const [activeDevice, setActiveDevice] = useState<Breakpoint>('desktop')

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    },
    [onClose],
  )

  useEffect(() => {
    if (!isOpen) return

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleKeyDown])

  if (!isOpen) return null

  const device = DEVICES.find((d) => d.id === activeDevice)!

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex h-14 shrink-0 items-center border-b border-zinc-700 bg-zinc-900 px-4">
        {/* Close button */}
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-white transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          aria-label="Close preview"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Title */}
        <span className="ml-3 mr-auto font-medium text-white">Preview</span>

        {/* Device toggle */}
        <div className="mr-4 flex items-center gap-1">
          {DEVICES.map((d) => {
            const Icon = d.icon
            const isActive = d.id === activeDevice
            return (
              <button
                key={d.id}
                onClick={() => setActiveDevice(d.id)}
                className={`rounded-md p-2 transition-colors ${
                  isActive
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                }`}
                aria-label={d.label}
                title={d.label}
              >
                <Icon className="h-4 w-4" />
              </button>
            )
          })}
        </div>

        {/* Width display */}
        <span className="text-sm tabular-nums text-zinc-400">
          {device.width}px
        </span>
      </div>

      {/* ── Preview area ────────────────────────────────────────────────── */}
      <div className="flex flex-1 items-start justify-center overflow-auto p-8">
        <div
          className="overflow-hidden rounded-lg border border-zinc-700 bg-white"
          style={{
            width: device.width,
            maxWidth: '100%',
            backgroundColor: design.globalStyles.backgroundColor,
          }}
        >
          {design.sections.map((section) => (
            <StaticSection key={section.id} section={section} />
          ))}
          {design.sections.length === 0 && (
            <div className="flex h-64 items-center justify-center text-sm text-gray-400">
              No sections to preview
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
