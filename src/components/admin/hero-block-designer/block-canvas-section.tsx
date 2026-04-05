'use client'

import { GripVertical } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getActiveSectionSettings } from '@/lib/hero-block-defaults'
import type { BlockSection, Breakpoint } from '@/types/hero-block-designer'
import { BlockCanvasColumn } from './block-canvas-column'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BlockCanvasSectionProps {
  section: BlockSection
  isSelected: boolean
  selectedColumnId: string | null
  selectedWidgetId: string | null
  breakpoint: Breakpoint
  onSelectSection: () => void
  onSelectColumn: (columnId: string) => void
  onSelectWidget: (widgetId: string) => void
  onAddWidget: (
    sectionId: string,
    columnId: string,
    atIndex?: number,
  ) => void
}

// ---------------------------------------------------------------------------
// Background style builder
// ---------------------------------------------------------------------------

function buildBackgroundStyles(
  settings: ReturnType<typeof getActiveSectionSettings>,
): React.CSSProperties {
  const bgType = settings.background.type

  switch (bgType) {
    case 'color':
      return {
        backgroundColor:
          settings.background.color && settings.background.color !== 'none'
            ? settings.background.color
            : undefined,
      }

    case 'image':
      return {
        backgroundImage: settings.background.image
          ? `url(${settings.background.image})`
          : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }

    case 'gradient':
      return {
        backgroundImage: settings.background.gradient || undefined,
      }

    case 'video':
      return {
        backgroundColor: '#1a1a2e',
      }

    default:
      return {}
  }
}

// ---------------------------------------------------------------------------
// BlockCanvasSection
// ---------------------------------------------------------------------------

export function BlockCanvasSection({
  section,
  isSelected,
  selectedColumnId,
  selectedWidgetId,
  breakpoint,
  onSelectSection,
  onSelectColumn,
  onSelectWidget,
  onAddWidget,
}: BlockCanvasSectionProps) {
  const settings = getActiveSectionSettings(section, breakpoint)
  const bgStyles = buildBackgroundStyles(settings)

  const minHeight = settings.minHeight > 0 ? settings.minHeight : undefined

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: section.id,
    data: { type: 'section', sectionId: section.id },
  })

  const sortableStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      className={`group/section relative ${
        isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''
      }`}
      style={{
        ...bgStyles,
        paddingTop: settings.padding.top,
        paddingRight: settings.padding.right,
        paddingBottom: settings.padding.bottom,
        paddingLeft: settings.padding.left,
        marginTop: settings.margin.top,
        marginBottom: settings.margin.bottom,
        minHeight,
        ...sortableStyle,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          e.stopPropagation()
          onSelectSection()
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelectSection()
      }}
    >
      {/* Section drag handle + label on hover */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 flex items-center gap-0.5 rounded-br bg-blue-500 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover/section:opacity-100">
        <span
          className="pointer-events-auto cursor-grab active:cursor-grabbing"
          {...listeners}
          {...attributes}
        >
          <GripVertical className="h-3 w-3" />
        </span>
        {section.label}
      </div>

      {/* Inner container — boxed or full width */}
      <div
        style={{
          maxWidth: settings.contentWidth > 0 ? settings.contentWidth : undefined,
          marginLeft: settings.horizontalAlign === 'center' || settings.horizontalAlign === 'right' ? 'auto' : undefined,
          marginRight: settings.horizontalAlign === 'center' || settings.horizontalAlign === 'left' ? 'auto' : undefined,
          display: 'flex',
          flexDirection: 'row',
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            e.stopPropagation()
            onSelectSection()
          }
        }}
      >
        {section.columns.map((column) => (
          <BlockCanvasColumn
            key={column.id}
            column={column}
            sectionId={section.id}
            isSelected={selectedColumnId === column.id}
            selectedWidgetId={selectedWidgetId}
            breakpoint={breakpoint}
            onSelectColumn={() => onSelectColumn(column.id)}
            onSelectWidget={(widgetId) => onSelectWidget(widgetId)}
            onAddWidget={(columnId, atIndex) =>
              onAddWidget(section.id, columnId, atIndex)
            }
          />
        ))}
      </div>
    </div>
  )
}
