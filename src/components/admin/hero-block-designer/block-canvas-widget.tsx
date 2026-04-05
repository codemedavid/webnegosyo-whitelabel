'use client'

import {
  GripVertical,
  ImageIcon,
  Play,
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
  type LucideIcon,
} from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getActiveWidgetProps } from '@/lib/hero-block-defaults'
import type { BlockWidget, BlockBackground, Breakpoint, WidgetProps } from '@/types/hero-block-designer'

// ---------------------------------------------------------------------------
// Icon map for icon widget rendering
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, LucideIcon> = {
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
  star: Star,
  heart: Heart,
  'shopping-cart': ShoppingCart,
  users: Users,
  award: Award,
  coffee: Coffee,
  'map-pin': MapPin,
  phone: Phone,
  mail: Mail,
  clock: Clock,
  image: ImageIcon,
  play: Play,
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BlockCanvasWidgetProps {
  widget: BlockWidget
  sectionId: string
  columnId: string
  isSelected: boolean
  breakpoint: Breakpoint
  onSelect: () => void
}

// ---------------------------------------------------------------------------
// Alignment resolver
// ---------------------------------------------------------------------------

function resolveAlignSelf(alignment: string): string {
  switch (alignment) {
    case 'left':
      return 'flex-start'
    case 'center':
      return 'center'
    case 'right':
      return 'flex-end'
    case 'stretch':
      return 'stretch'
    default:
      return 'center'
  }
}

function resolveWidth(width: string): string {
  if (width === 'auto') return 'auto'
  if (width === 'full') return '100%'
  // Assume numeric percentage
  const num = parseFloat(width)
  if (!isNaN(num)) return `${num}%`
  return 'auto'
}

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
// Widget content renderer (switch on kind)
// ---------------------------------------------------------------------------

function renderWidgetContent(props: WidgetProps): React.ReactNode {
  switch (props.kind) {
    case 'text': {
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
            wordBreak: 'break-word',
            margin: 0,
          }}
        >
          {props.content || 'Text element'}
        </div>
      )
    }

    case 'image':
      return props.src ? (
        <img
          src={props.src}
          alt={props.alt}
          style={{
            width: props.width ? `${props.width}px` : '100%',
            height: props.height ? `${props.height}px` : 'auto',
            objectFit: props.objectFit,
            borderRadius: props.borderRadius,
            opacity: props.opacity,
            display: 'block',
          }}
          draggable={false}
        />
      ) : (
        <div className="flex h-40 w-full items-center justify-center rounded bg-muted">
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        </div>
      )

    case 'button':
      return (
        <div
          style={{
            backgroundColor: props.backgroundColor,
            color: props.textColor,
            borderWidth: props.borderWidth,
            borderColor: props.borderColor,
            borderStyle: 'solid',
            borderRadius: props.borderRadius,
            fontSize: props.fontSize,
            fontWeight: props.fontWeight,
            padding: '12px 24px',
            textAlign: 'center',
            cursor: 'default',
            display: 'inline-block',
          }}
        >
          {props.text || 'Button'}
        </div>
      )

    case 'shape':
      return (
        <div
          style={{
            backgroundColor: props.fillColor,
            borderWidth: props.borderWidth,
            borderColor: props.borderColor,
            borderStyle: 'solid',
            borderRadius:
              props.shapeType === 'circle' ? '50%' : props.borderRadius,
            opacity: props.opacity,
            minHeight: 40,
            width: '100%',
          }}
        />
      )

    case 'divider':
      return props.orientation === 'horizontal' ? (
        <hr
          style={{
            borderTop: `${props.thickness}px ${props.style} ${props.color}`,
            borderBottom: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            width: '100%',
            margin: 0,
          }}
        />
      ) : (
        <hr
          style={{
            borderLeft: `${props.thickness}px ${props.style} ${props.color}`,
            borderTop: 'none',
            borderBottom: 'none',
            borderRight: 'none',
            height: '100%',
            minHeight: 40,
            margin: 0,
          }}
        />
      )

    case 'spacer':
      return <div style={{ height: props.height }} />

    case 'icon': {
      const IconComponent = ICON_MAP[props.iconName] ?? Star
      return (
        <div className="flex items-center justify-center">
          <IconComponent size={props.size} color={props.color} />
        </div>
      )
    }

    case 'video':
      return props.videoUrl ? (
        <div className="flex h-48 w-full items-center justify-center rounded bg-black/80">
          <Play className="h-12 w-12 text-white" />
        </div>
      ) : (
        <div className="flex h-48 w-full items-center justify-center rounded bg-zinc-900">
          <Play className="h-12 w-12 text-zinc-500" />
        </div>
      )

    case 'countdown':
      return (
        <div
          className="flex items-center justify-center gap-1 font-mono"
          style={{ fontSize: props.fontSize, color: props.color }}
        >
          {props.showDays && <span>00</span>}
          {props.showDays && (
            <span style={{ color: props.separatorColor }}>:</span>
          )}
          {props.showHours && <span>00</span>}
          {props.showHours && (
            <span style={{ color: props.separatorColor }}>:</span>
          )}
          {props.showMinutes && <span>00</span>}
          {props.showMinutes && (
            <span style={{ color: props.separatorColor }}>:</span>
          )}
          {props.showSeconds && <span>00</span>}
        </div>
      )

    case 'social-proof': {
      const BadgeIcon = ICON_MAP[props.iconName] ?? Star
      return (
        <div
          className="inline-flex items-center gap-2 px-3 py-1"
          style={{
            backgroundColor: props.backgroundColor,
            color: props.textColor,
            borderRadius:
              props.badgeStyle === 'pill'
                ? 9999
                : props.badgeStyle === 'rounded'
                  ? 8
                  : 0,
          }}
        >
          <BadgeIcon className="h-4 w-4" />
          <span className="text-sm font-medium">
            {props.number > 0 ? `${props.number}+ ` : ''}
            {props.text || 'Social proof'}
          </span>
        </div>
      )
    }

    case 'animated-bg':
      return (
        <div
          className="h-full w-full"
          style={{
            minHeight: 80,
            background:
              props.gradientType === 'linear'
                ? `linear-gradient(${props.gradientAngle}deg, ${props.gradientColors.join(', ')})`
                : props.gradientType === 'radial'
                  ? `radial-gradient(circle, ${props.gradientColors.join(', ')})`
                  : props.gradientColors[0] ?? '#e5e7eb',
            opacity: props.patternOpacity,
          }}
        />
      )

    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// BlockCanvasWidget
// ---------------------------------------------------------------------------

export function BlockCanvasWidget({
  widget,
  sectionId,
  columnId,
  isSelected,
  breakpoint,
  onSelect,
}: BlockCanvasWidgetProps) {
  const resolvedProps = getActiveWidgetProps(widget, breakpoint)
  const isHidden = !widget.visibility[breakpoint]

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: widget.id,
    data: { type: 'widget', sectionId, columnId, widgetId: widget.id },
  })

  const sortableStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : isHidden ? 0.3 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      className={`group/widget relative select-none transition-all ${
        isSelected
          ? 'ring-2 ring-blue-500 ring-offset-1'
          : 'hover:outline hover:outline-1 hover:outline-dashed hover:outline-blue-300'
      }`}
      style={{
        alignSelf: resolveAlignSelf(widget.alignment),
        width: resolveWidth(widget.width),
        marginTop: widget.margin.top,
        marginBottom: widget.margin.bottom,
        paddingTop: widget.padding.top,
        paddingRight: widget.padding.right,
        paddingBottom: widget.padding.bottom,
        paddingLeft: widget.padding.left,
        ...resolveBlockBackgroundStyles(widget.background),
        ...sortableStyle,
      }}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect()
      }}
    >
      {/* Drag handle — appears on hover */}
      <div
        className="absolute -left-1 top-1/2 z-30 -translate-x-full -translate-y-1/2 cursor-grab rounded bg-blue-500 p-0.5 text-white opacity-0 shadow transition-opacity group-hover/widget:opacity-100 active:cursor-grabbing"
        {...listeners}
        {...attributes}
      >
        <GripVertical className="h-3 w-3" />
      </div>

      {/* Hidden overlay with striped pattern */}
      {isHidden && (
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.05) 4px, rgba(0,0,0,0.05) 8px)',
          }}
        />
      )}

      {/* Selected state: floating label */}
      {isSelected && (
        <div className="absolute -top-5 left-0 z-20 rounded bg-blue-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {widget.type}
        </div>
      )}

      {/* Widget content */}
      {renderWidgetContent(resolvedProps)}
    </div>
  )
}
