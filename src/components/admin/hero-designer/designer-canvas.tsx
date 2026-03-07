'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { CanvasElement } from '@/components/admin/hero-designer/canvas-element'
import type {
  HeroDesign,
  Breakpoint,
  ElementLayout,
  ElementProps,
  HeroElementType,
} from '@/types/hero-designer'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DesignerCanvasProps {
  design: HeroDesign
  breakpoint: Breakpoint
  selectedElementId: string | null
  zoom: number
  showGrid: boolean
  onSelectElement: (id: string | null) => void
  onUpdateElementLayout: (elementId: string, breakpoint: Breakpoint, layout: Partial<ElementLayout>) => void
  onUpdateElementProps: (elementId: string, props: Partial<ElementProps>) => void
  onDropNewElement: (elementType: HeroElementType, x: number, y: number) => void
}

// ---------------------------------------------------------------------------
// Grid overlay background (10% intervals)
// ---------------------------------------------------------------------------

const GRID_BG_IMAGE = [
  'repeating-linear-gradient(to right, rgba(0,0,0,0.08) 0px, rgba(0,0,0,0.08) 1px, transparent 1px, transparent 10%)',
  'repeating-linear-gradient(to bottom, rgba(0,0,0,0.08) 0px, rgba(0,0,0,0.08) 1px, transparent 1px, transparent 10%)',
].join(', ')

// ---------------------------------------------------------------------------
// DesignerCanvas component
// ---------------------------------------------------------------------------

export function DesignerCanvas({
  design,
  breakpoint,
  selectedElementId,
  zoom,
  showGrid,
  onSelectElement,
  onUpdateElementLayout,
  onUpdateElementProps,
  onDropNewElement,
}: DesignerCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  // Canvas nominal dimensions
  const canvasWidth = design.canvas[breakpoint].width
  const canvasHeight = design.canvas[breakpoint].height

  // --- Measure available container space ---------------------------------
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setContainerSize({ width, height })
      }
    })

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // --- Scale factor ------------------------------------------------------
  const scaleFactor =
    containerSize.width > 0 && containerSize.height > 0
      ? Math.min(containerSize.width / canvasWidth, containerSize.height / canvasHeight, zoom)
      : zoom

  // --- Drop zone (dnd-kit) -----------------------------------------------
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: 'designer-canvas-drop',
    data: { canvasWidth, canvasHeight, onDropNewElement },
  })

  // Combine refs
  const canvasRef = useCallback(
    (node: HTMLDivElement | null) => {
      setDropRef(node)
    },
    [setDropRef],
  )

  // --- Handle drop from element panel ------------------------------------
  // dnd-kit fires onDragEnd at the DndContext level; here we provide the
  // drop target. The parent orchestrator should call onDropNewElement with
  // the calculated position. We expose the canvas rect via a data attribute
  // so the parent can compute x/y percentages.

  // --- Click on empty area to deselect -----------------------------------
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onSelectElement(null)
      }
    },
    [onSelectElement],
  )

  // --- Background styles -------------------------------------------------
  const bgStyles: React.CSSProperties = {
    backgroundColor: design.backgroundColor,
  }

  if (design.backgroundImage) {
    bgStyles.backgroundImage = `url(${design.backgroundImage.url})`
    bgStyles.backgroundSize = design.backgroundImage.objectFit === 'fill' ? '100% 100%' : design.backgroundImage.objectFit
    bgStyles.backgroundPosition = 'center'
    bgStyles.backgroundRepeat = 'no-repeat'
  }

  // --- Sorted visible elements -------------------------------------------
  const sortedElements = [...design.elements]
    .filter((el) => el.visible)
    .sort((a, b) => a.zIndex - b.zIndex)

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-start justify-center overflow-auto bg-muted/30 p-4"
    >
      {/* Scaled canvas wrapper */}
      <div
        ref={canvasRef}
        data-canvas-width={canvasWidth}
        data-canvas-height={canvasHeight}
        className={`relative shrink-0 shadow-lg ${isOver ? 'ring-2 ring-blue-400 ring-offset-2' : ''}`}
        style={{
          width: canvasWidth,
          height: canvasHeight,
          transform: `scale(${scaleFactor})`,
          transformOrigin: 'top center',
          ...bgStyles,
        }}
        onClick={handleCanvasClick}
      >
        {/* Background image opacity overlay */}
        {design.backgroundImage && design.backgroundImage.opacity < 1 && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundColor: design.backgroundColor,
              opacity: 1 - design.backgroundImage.opacity,
            }}
          />
        )}

        {/* Grid overlay */}
        {showGrid && (
          <div
            className="pointer-events-none absolute inset-0 z-40"
            style={{ backgroundImage: GRID_BG_IMAGE }}
          />
        )}

        {/* Canvas elements */}
        {sortedElements.map((element) => (
          <CanvasElement
            key={element.id}
            element={element}
            isSelected={element.id === selectedElementId}
            breakpoint={breakpoint}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            showGrid={showGrid}
            onSelect={() => onSelectElement(element.id)}
            onLayoutChange={(layout) =>
              onUpdateElementLayout(element.id, breakpoint, layout)
            }
            onPropsChange={(props) =>
              onUpdateElementProps(element.id, props)
            }
          />
        ))}
      </div>
    </div>
  )
}
