'use client'

import { useCallback, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import {
  Lock,
  ImageIcon,
  Play,
  Star,
  ShoppingCart,
  Users,
  Heart,
  type LucideIcon,
} from 'lucide-react'
import { getActiveProps } from '@/lib/hero-designer-defaults'
import type {
  HeroElement,
  Breakpoint,
  ElementLayout,
  ElementProps,
} from '@/types/hero-designer'

// ---------------------------------------------------------------------------
// Icon map for the icon element kind
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, LucideIcon> = {
  star: Star,
  'shopping-cart': ShoppingCart,
  users: Users,
  heart: Heart,
  image: ImageIcon,
  play: Play,
  lock: Lock,
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CanvasElementProps {
  element: HeroElement
  isSelected: boolean
  breakpoint: Breakpoint
  canvasWidth: number
  canvasHeight: number
  showGrid: boolean
  onSelect: () => void
  onLayoutChange: (layout: Partial<ElementLayout>) => void
  onPropsChange: (props: Partial<ElementProps>) => void
}

// ---------------------------------------------------------------------------
// Snap helper
// ---------------------------------------------------------------------------

const SNAP_INCREMENT = 2

function snap(value: number, enabled: boolean): number {
  if (!enabled) return value
  return Math.round(value / SNAP_INCREMENT) * SNAP_INCREMENT
}

// ---------------------------------------------------------------------------
// Resize handle positions
// ---------------------------------------------------------------------------

const HANDLE_POSITIONS = [
  { cursor: 'nwse-resize', style: { top: -4, left: -4 }, dx: -1, dy: -1, dw: 1, dh: 1 },
  { cursor: 'ns-resize', style: { top: -4, left: '50%', marginLeft: -4 }, dx: 0, dy: -1, dw: 0, dh: 1 },
  { cursor: 'nesw-resize', style: { top: -4, right: -4 }, dx: 0, dy: -1, dw: 1, dh: 1 },
  { cursor: 'ew-resize', style: { top: '50%', right: -4, marginTop: -4 }, dx: 0, dy: 0, dw: 1, dh: 0 },
  { cursor: 'nwse-resize', style: { bottom: -4, right: -4 }, dx: 0, dy: 0, dw: 1, dh: 1 },
  { cursor: 'ns-resize', style: { bottom: -4, left: '50%', marginLeft: -4 }, dx: 0, dy: 0, dw: 0, dh: 1 },
  { cursor: 'nesw-resize', style: { bottom: -4, left: -4 }, dx: -1, dy: 0, dw: 1, dh: 1 },
  { cursor: 'ew-resize', style: { top: '50%', left: -4, marginTop: -4 }, dx: -1, dy: 0, dw: 1, dh: 0 },
] as const

// ---------------------------------------------------------------------------
// Element content renderers
// ---------------------------------------------------------------------------

function renderElementContent(props: ElementProps): React.ReactNode {
  switch (props.kind) {
    case 'text': {
      const Tag = props.fontSize >= 24 ? 'h1' : 'p'
      return (
        <Tag
          style={{
            fontFamily: props.fontFamily,
            fontSize: props.fontSize,
            fontWeight: props.fontWeight,
            lineHeight: props.lineHeight,
            letterSpacing: props.letterSpacing,
            color: props.color,
            textAlign: props.textAlign,
            textShadow: props.textShadow || undefined,
            fontStyle: props.italic ? 'italic' : undefined,
            textDecoration: props.underline ? 'underline' : undefined,
            margin: 0,
            wordBreak: 'break-word',
          }}
        >
          {props.content || 'Text element'}
        </Tag>
      )
    }

    case 'image':
      return props.src ? (
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
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-muted">
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        </div>
      )

    case 'button':
      return (
        <div
          className="flex h-full w-full items-center justify-center"
          style={{
            backgroundColor: props.backgroundColor,
            color: props.textColor,
            borderWidth: props.borderWidth,
            borderColor: props.borderColor,
            borderStyle: 'solid',
            borderRadius: props.borderRadius,
            fontSize: props.fontSize,
            fontWeight: props.fontWeight,
            cursor: 'default',
          }}
        >
          {props.text || 'Button'}
        </div>
      )

    case 'shape':
      return (
        <div
          className="h-full w-full"
          style={{
            backgroundColor: props.fillColor,
            borderWidth: props.borderWidth,
            borderColor: props.borderColor,
            borderStyle: 'solid',
            borderRadius:
              props.shapeType === 'circle'
                ? '50%'
                : props.borderRadius,
            opacity: props.opacity,
          }}
        />
      )

    case 'divider':
      return (
        <div
          className="h-full w-full"
          style={
            props.orientation === 'horizontal'
              ? { borderTopWidth: props.thickness, borderTopColor: props.color, borderTopStyle: props.style }
              : { borderLeftWidth: props.thickness, borderLeftColor: props.color, borderLeftStyle: props.style, height: '100%' }
          }
        />
      )

    case 'icon': {
      const IconComponent = ICON_MAP[props.iconName] ?? Star
      return (
        <div className="flex h-full w-full items-center justify-center">
          <IconComponent size={props.size} color={props.color} />
        </div>
      )
    }

    case 'video':
      return (
        <div className="flex h-full w-full items-center justify-center bg-black/80">
          <Play className="h-12 w-12 text-white" />
        </div>
      )

    case 'countdown':
      return (
        <div
          className="flex h-full w-full items-center justify-center gap-1 font-mono"
          style={{ fontSize: props.fontSize, color: props.color }}
        >
          {props.showDays && <span>00</span>}
          {props.showDays && <span style={{ color: props.separatorColor }}>:</span>}
          {props.showHours && <span>00</span>}
          {props.showHours && <span style={{ color: props.separatorColor }}>:</span>}
          {props.showMinutes && <span>00</span>}
          {props.showMinutes && <span style={{ color: props.separatorColor }}>:</span>}
          {props.showSeconds && <span>00</span>}
        </div>
      )

    case 'social-proof': {
      const BadgeIcon = ICON_MAP[props.iconName] ?? Star
      return (
        <div
          className="flex h-full w-full items-center justify-center gap-2 px-3 py-1"
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

    case 'row':
      return (
        <div
          className="h-full w-full"
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: props.gap,
            alignItems: props.alignItems,
            justifyContent: props.justifyContent,
            flexWrap: props.wrap ? 'wrap' : 'nowrap',
            backgroundColor: props.backgroundColor,
            borderRadius: props.borderRadius,
            padding: props.padding,
            border: '2px dashed rgba(99, 102, 241, 0.4)',
            minHeight: 40,
          }}
        >
          <span className="absolute left-1 top-0.5 text-[10px] font-medium text-indigo-400 opacity-60">
            Row
          </span>
        </div>
      )

    case 'column':
      return (
        <div
          className="h-full w-full"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: props.gap,
            alignItems: props.alignItems,
            justifyContent: props.justifyContent,
            backgroundColor: props.backgroundColor || 'rgba(99, 102, 241, 0.05)',
            borderRadius: props.borderRadius,
            padding: props.padding,
            border: '1px dashed rgba(99, 102, 241, 0.3)',
            flex: props.flex,
            minHeight: 30,
          }}
        >
          <span className="text-[10px] font-medium text-indigo-400 opacity-60">
            Col
          </span>
        </div>
      )

    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// CanvasElement component
// ---------------------------------------------------------------------------

export function CanvasElement({
  element,
  isSelected,
  breakpoint,
  canvasWidth,
  canvasHeight,
  showGrid,
  onSelect,
  onLayoutChange,
}: CanvasElementProps) {
  const layout = element[breakpoint]
  const resolvedProps = getActiveProps(element, breakpoint)
  const elRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)

  // --- Convert % → px --------------------------------------------------
  const pxX = (layout.x / 100) * canvasWidth
  const pxY = (layout.y / 100) * canvasHeight
  const pxW = layout.width === -1 ? undefined : (layout.width / 100) * canvasWidth
  const pxH = layout.height === -1 ? undefined : (layout.height / 100) * canvasHeight

  // --- Drag handler -----------------------------------------------------
  const handleDragStart = useCallback(
    (e: ReactMouseEvent) => {
      if (element.locked) return
      e.stopPropagation()
      e.preventDefault()
      onSelect()
      isDraggingRef.current = true

      const startX = e.clientX
      const startY = e.clientY
      const origLayout = { ...layout }

      function onMouseMove(ev: globalThis.MouseEvent) {
        if (!isDraggingRef.current) return
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        const pctDx = (dx / canvasWidth) * 100
        const pctDy = (dy / canvasHeight) * 100

        onLayoutChange({
          x: snap(origLayout.x + pctDx, showGrid),
          y: snap(origLayout.y + pctDy, showGrid),
        })
      }

      function onMouseUp() {
        isDraggingRef.current = false
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
      }

      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    },
    [element.locked, layout, canvasWidth, canvasHeight, showGrid, onSelect, onLayoutChange],
  )

  // --- Resize handler ---------------------------------------------------
  const handleResizeStart = useCallback(
    (e: ReactMouseEvent, handle: (typeof HANDLE_POSITIONS)[number]) => {
      if (element.locked) return
      e.stopPropagation()
      e.preventDefault()
      isDraggingRef.current = true

      const startX = e.clientX
      const startY = e.clientY
      const origLayout = { ...layout }

      function onMouseMove(ev: globalThis.MouseEvent) {
        if (!isDraggingRef.current) return
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        const pctDx = (dx / canvasWidth) * 100
        const pctDy = (dy / canvasHeight) * 100

        const updates: Partial<ElementLayout> = {}

        if (handle.dx !== 0) {
          updates.x = snap(origLayout.x + pctDx * handle.dx, showGrid)
        }
        if (handle.dy !== 0) {
          updates.y = snap(origLayout.y + pctDy * handle.dy, showGrid)
        }
        if (handle.dw !== 0 && origLayout.width !== -1) {
          const sign = handle.dx !== 0 ? -1 : 1
          updates.width = snap(
            Math.max(2, origLayout.width + pctDx * handle.dw * sign),
            showGrid,
          )
        }
        if (handle.dh !== 0 && origLayout.height !== -1) {
          const sign = handle.dy !== 0 ? -1 : 1
          updates.height = snap(
            Math.max(2, origLayout.height + pctDy * handle.dh * sign),
            showGrid,
          )
        }

        onLayoutChange(updates)
      }

      function onMouseUp() {
        isDraggingRef.current = false
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
      }

      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    },
    [element.locked, layout, canvasWidth, canvasHeight, showGrid, onLayoutChange],
  )

  // --- Visibility -------------------------------------------------------
  if (!element.visible) return null

  return (
    <div
      ref={elRef}
      role="button"
      tabIndex={0}
      className={`absolute select-none ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
      style={{
        left: pxX,
        top: pxY,
        width: pxW ?? 'auto',
        height: pxH ?? 'auto',
        transform: layout.rotation ? `rotate(${layout.rotation}deg)` : undefined,
        opacity: resolvedProps.kind === 'image' ? resolvedProps.opacity : undefined,
        zIndex: element.zIndex,
        padding: `${layout.padding.top}px ${layout.padding.right}px ${layout.padding.bottom}px ${layout.padding.left}px`,
        margin: `${layout.margin.top}px ${layout.margin.right}px ${layout.margin.bottom}px ${layout.margin.left}px`,
        overflow: 'hidden',
        cursor: element.locked ? 'default' : 'move',
      }}
      onMouseDown={handleDragStart}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect()
      }}
    >
      {/* Element content */}
      {renderElementContent(resolvedProps)}

      {/* Lock overlay */}
      {element.locked && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/10">
          <Lock className="h-4 w-4 text-white drop-shadow" />
        </div>
      )}

      {/* Resize handles */}
      {isSelected && !element.locked &&
        HANDLE_POSITIONS.map((handle, i) => (
          <div
            key={i}
            className="absolute z-50 h-2 w-2 border border-white bg-blue-500"
            style={{ ...handle.style, cursor: handle.cursor }}
            onMouseDown={(e) => handleResizeStart(e, handle)}
          />
        ))}
    </div>
  )
}
