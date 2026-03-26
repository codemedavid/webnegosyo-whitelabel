'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { CanvasElement } from '@/components/admin/hero-designer/canvas-element'
import { getActiveProps } from '@/lib/hero-designer-defaults'
import type {
  HeroDesign,
  HeroElement,
  Breakpoint,
  ElementLayout,
  ElementProps,
  HeroElementType,
  RowProps,
  ColumnProps,
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
// Container canvas element (rows with column children)
// ---------------------------------------------------------------------------

function ContainerCanvasElement({
  element,
  columns,
  childrenByParent,
  isSelected,
  selectedElementId,
  breakpoint,
  canvasWidth,
  canvasHeight,
  showGrid,
  onSelectElement,
  onUpdateElementLayout,
  onUpdateElementProps,
}: {
  element: HeroElement
  columns: HeroElement[]
  childrenByParent: Map<string, HeroElement[]>
  isSelected: boolean
  selectedElementId: string | null
  breakpoint: Breakpoint
  canvasWidth: number
  canvasHeight: number
  showGrid: boolean
  onSelectElement: (id: string | null) => void
  onUpdateElementLayout: (elementId: string, breakpoint: Breakpoint, layout: Partial<ElementLayout>) => void
  onUpdateElementProps: (elementId: string, props: Partial<ElementProps>) => void
}) {
  const layout = element[breakpoint]
  const rowProps = getActiveProps(element, breakpoint) as RowProps

  const pxX = (layout.x / 100) * canvasWidth
  const pxY = (layout.y / 100) * canvasHeight
  const pxW = layout.width === -1 ? undefined : (layout.width / 100) * canvasWidth
  const pxH = layout.height === -1 ? undefined : (layout.height / 100) * canvasHeight

  return (
    <div
      className={`absolute ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
      style={{
        left: pxX,
        top: pxY,
        width: pxW ?? 'auto',
        height: pxH ?? 'auto',
        zIndex: element.zIndex,
        cursor: 'move',
      }}
      onClick={(e) => {
        e.stopPropagation()
        onSelectElement(element.id)
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: rowProps.gap,
          alignItems: rowProps.alignItems,
          justifyContent: rowProps.justifyContent,
          flexWrap: rowProps.wrap ? 'wrap' : 'nowrap',
          backgroundColor: rowProps.backgroundColor,
          borderRadius: rowProps.borderRadius,
          padding: rowProps.padding,
          border: '2px dashed rgba(99, 102, 241, 0.4)',
          minHeight: 40,
          width: '100%',
          height: '100%',
          position: 'relative',
        }}
      >
        <span className="absolute left-1 top-0.5 z-10 text-[10px] font-medium text-indigo-400 opacity-60">
          Row
        </span>
        {columns.map((col) => {
          const colProps = getActiveProps(col, breakpoint) as ColumnProps
          const colChildren = childrenByParent.get(col.id) ?? []
          return (
            <div
              key={col.id}
              className={`relative ${col.id === selectedElementId ? 'ring-2 ring-blue-500' : ''}`}
              style={{
                flex: colProps.flex,
                display: 'flex',
                flexDirection: 'column',
                gap: colProps.gap,
                alignItems: colProps.alignItems,
                justifyContent: colProps.justifyContent,
                backgroundColor: colProps.backgroundColor || 'rgba(99, 102, 241, 0.05)',
                borderRadius: colProps.borderRadius,
                padding: colProps.padding,
                border: '1px dashed rgba(99, 102, 241, 0.3)',
                minHeight: 30,
                cursor: 'pointer',
              }}
              onClick={(e) => {
                e.stopPropagation()
                onSelectElement(col.id)
              }}
            >
              <span className="text-[10px] font-medium text-indigo-400 opacity-60">
                Col
              </span>
              {/* Render children inside column using flow layout */}
              {colChildren.map((child) => (
                <CanvasElement
                  key={child.id}
                  element={{
                    ...child,
                    // Override layout for flow positioning inside column
                    [breakpoint]: {
                      ...child[breakpoint],
                      x: 0,
                      y: 0,
                    },
                  }}
                  isSelected={child.id === selectedElementId}
                  breakpoint={breakpoint}
                  canvasWidth={pxW ?? canvasWidth}
                  canvasHeight={pxH ?? canvasHeight}
                  showGrid={showGrid}
                  onSelect={() => onSelectElement(child.id)}
                  onLayoutChange={(lay) =>
                    onUpdateElementLayout(child.id, breakpoint, lay)
                  }
                  onPropsChange={(props) =>
                    onUpdateElementProps(child.id, props)
                  }
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

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

  // --- Sorted visible root elements (no parentId) -----------------------
  const sortedElements = [...design.elements]
    .filter((el) => (el.visibility?.[breakpoint] ?? el.visible !== false) && !el.parentId)
    .sort((a, b) => a.zIndex - b.zIndex)

  // --- Build child map for containers ------------------------------------
  const childrenByParent = new Map<string, typeof design.elements>()
  for (const el of design.elements) {
    if (el.parentId && (el.visibility?.[breakpoint] ?? el.visible !== false)) {
      const siblings = childrenByParent.get(el.parentId) ?? []
      siblings.push(el)
      childrenByParent.set(el.parentId, siblings)
    }
  }

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
        {sortedElements.map((element) => {
          const resolvedProps = getActiveProps(element, breakpoint)
          // Row containers render with their children inside
          if (resolvedProps.kind === 'row') {
            const columns = childrenByParent.get(element.id) ?? []
            return (
              <ContainerCanvasElement
                key={element.id}
                element={element}
                columns={columns}
                childrenByParent={childrenByParent}
                isSelected={element.id === selectedElementId}
                selectedElementId={selectedElementId}
                breakpoint={breakpoint}
                canvasWidth={canvasWidth}
                canvasHeight={canvasHeight}
                showGrid={showGrid}
                onSelectElement={onSelectElement}
                onUpdateElementLayout={onUpdateElementLayout}
                onUpdateElementProps={onUpdateElementProps}
              />
            )
          }

          return (
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
          )
        })}
      </div>
    </div>
  )
}
