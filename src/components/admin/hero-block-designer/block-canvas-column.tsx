'use client'

import { getActiveColumnSettings } from '@/lib/hero-block-defaults'
import type { BlockColumn, BlockBackground, Breakpoint } from '@/types/hero-block-designer'
import { BlockCanvasWidget } from './block-canvas-widget'
import { InsertionPoint, EmptyColumnDropZone } from './insertion-point'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BlockCanvasColumnProps {
  column: BlockColumn
  isSelected: boolean
  selectedWidgetId: string | null
  breakpoint: Breakpoint
  onSelectColumn: () => void
  onSelectWidget: (widgetId: string) => void
  onAddWidget: (columnId: string, atIndex?: number) => void
}

// ---------------------------------------------------------------------------
// Alignment helpers
// ---------------------------------------------------------------------------

function resolveJustifyContent(verticalAlign: string): string {
  switch (verticalAlign) {
    case 'top':
      return 'flex-start'
    case 'center':
    case 'middle':
      return 'center'
    case 'bottom':
      return 'flex-end'
    default:
      return 'flex-start'
  }
}

function resolveAlignItems(horizontalAlign: string): string {
  switch (horizontalAlign) {
    case 'left':
      return 'flex-start'
    case 'center':
      return 'center'
    case 'right':
      return 'flex-end'
    default:
      return 'flex-start'
  }
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
// BlockCanvasColumn
// ---------------------------------------------------------------------------

export function BlockCanvasColumn({
  column,
  isSelected,
  selectedWidgetId,
  breakpoint,
  onSelectColumn,
  onSelectWidget,
  onAddWidget,
}: BlockCanvasColumnProps) {
  const settings = getActiveColumnSettings(column, breakpoint)

  const hasWidgets = column.widgets.length > 0

  return (
    <div
      role="button"
      tabIndex={0}
      className={`relative flex flex-col ${
        isSelected
          ? 'ring-2 ring-blue-500'
          : 'hover:outline hover:outline-1 hover:outline-dashed hover:outline-indigo-300'
      }`}
      style={{
        flex: column.width,
        width: `${column.width}%`,
        justifyContent: resolveJustifyContent(settings.verticalAlign),
        alignItems: resolveAlignItems(settings.horizontalAlign),
        paddingTop: settings.padding.top,
        paddingRight: settings.padding.right,
        paddingBottom: settings.padding.bottom,
        paddingLeft: settings.padding.left,
        ...resolveBlockBackgroundStyles(settings.background),
        borderRadius: settings.borderRadius,
        minHeight: 60,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          e.stopPropagation()
          onSelectColumn()
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelectColumn()
      }}
    >
      {/* Column label */}
      <span className="pointer-events-none absolute left-1 top-0.5 text-[10px] font-medium text-indigo-400 opacity-60">
        Col
      </span>

      {hasWidgets ? (
        <>
          {/* Insertion point before first widget */}
          <InsertionPoint
            onClick={() => onAddWidget(column.id, 0)}
            label="Insert widget"
          />

          {column.widgets.map((widget, index) => (
            <div key={widget.id} className="flex w-full flex-col">
              <BlockCanvasWidget
                widget={widget}
                isSelected={selectedWidgetId === widget.id}
                breakpoint={breakpoint}
                onSelect={() => onSelectWidget(widget.id)}
              />

              {/* Insertion point after each widget */}
              <InsertionPoint
                onClick={() => onAddWidget(column.id, index + 1)}
                label="Insert widget"
              />
            </div>
          ))}
        </>
      ) : (
        <EmptyColumnDropZone onClick={() => onAddWidget(column.id)} />
      )}
    </div>
  )
}
