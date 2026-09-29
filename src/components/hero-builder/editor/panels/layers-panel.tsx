'use client'

import { useState, type DragEvent } from 'react'
import { ChevronRight, Columns3, EyeOff, GripVertical, LayoutPanelTop } from 'lucide-react'

import { cn } from '@/lib/utils'
import { WIDGET_DEFAULTS } from '@/lib/hero-builder/defaults'
import { resolveStyle } from '@/lib/hero-builder/resolve'
import { findNode } from '@/lib/hero-builder/tree-ops'
import type { Responsive } from '@/lib/hero-builder/types'

import { DRAG_MOVE } from '../canvas'
import type { HeroBuilderApi } from '../use-hero-builder'

const DRAG_SECTION = 'application/x-hb-section'

function textPreview(content: unknown): string {
  const c = content as { text?: unknown; items?: { label?: string }[] }
  if (typeof c.text === 'string') return c.text.replace(/[*[\]()]/g, '').slice(0, 32)
  if (Array.isArray(c.items) && c.items[0]?.label) return c.items[0].label
  return ''
}

function HiddenMark({ node, api }: { node: Responsive; api: HeroBuilderApi }) {
  return resolveStyle(node, api.device).hidden ? <EyeOff className="h-3 w-3 shrink-0 text-amber-600" aria-label="Hidden on this device" /> : null
}

export function LayersPanel({ api }: { api: HeroBuilderApi }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [dropSection, setDropSection] = useState<number | null>(null)
  const selectedSection = findNode(api.design, api.selectedId)?.sectionId

  const onSectionDrop = (event: DragEvent, index: number) => {
    const id = event.dataTransfer.getData(DRAG_SECTION)
    setDropSection(null)
    if (id) api.moveSectionTo(id, index)
  }

  if (api.design.sections.length === 0) {
    return <p className="p-4 text-xs text-neutral-500">Nothing here yet. Add a section or pick a template.</p>
  }

  return (
    <div className="p-2 text-xs">
      {api.design.sections.map((section, si) => {
        const isOpen = !collapsed[section.id]
        return (
          <div
            key={section.id}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(DRAG_SECTION)) return
              e.preventDefault()
              setDropSection(si)
            }}
            onDrop={(e) => onSectionDrop(e, si)}
            className={cn('rounded-md', dropSection === si && 'ring-2 ring-sky-400')}
          >
            <div
              className={cn(
                'group flex items-center gap-1 rounded-md px-1.5 py-1.5',
                api.selectedId === section.id ? 'bg-sky-100 text-sky-900' : selectedSection === section.id ? 'bg-neutral-100' : 'hover:bg-neutral-100',
              )}
            >
              <span
                draggable
                onDragStart={(e) => e.dataTransfer.setData(DRAG_SECTION, section.id)}
                className="cursor-grab text-neutral-300 group-hover:text-neutral-500"
                title="Drag to reorder"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </span>
              <button type="button" onClick={() => setCollapsed((c) => ({ ...c, [section.id]: isOpen }))} className="text-neutral-400" aria-label={isOpen ? 'Collapse' : 'Expand'}>
                <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-90')} />
              </button>
              <button type="button" onClick={() => api.select(section.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-semibold">
                <LayoutPanelTop className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                <span className="truncate">{section.label || `Section ${si + 1}`}</span>
              </button>
              <HiddenMark node={section} api={api} />
            </div>
            {isOpen &&
              section.columns.map((column, ci) => (
                <div key={column.id} className="ml-5">
                  {section.columns.length > 1 && (
                    <button
                      type="button"
                      onClick={() => api.select(column.id)}
                      className={cn(
                        'flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-neutral-600',
                        api.selectedId === column.id ? 'bg-sky-100 text-sky-900' : 'hover:bg-neutral-100',
                      )}
                    >
                      <Columns3 className="h-3.5 w-3.5 text-neutral-400" />
                      Column {ci + 1}
                      <HiddenMark node={column} api={api} />
                    </button>
                  )}
                  <div className={cn(section.columns.length > 1 && 'ml-4')}>
                    {column.widgets.map((widget) => {
                      const Label = WIDGET_DEFAULTS[widget.kind]?.label ?? widget.kind
                      const preview = textPreview(widget.content)
                      return (
                        <div
                          key={widget.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData(DRAG_MOVE, widget.id)
                            e.dataTransfer.effectAllowed = 'move'
                          }}
                          onDragOver={(e) => e.dataTransfer.types.includes(DRAG_MOVE) && e.preventDefault()}
                          onDrop={(e) => {
                            const id = e.dataTransfer.getData(DRAG_MOVE)
                            if (!id || id === widget.id) return
                            e.stopPropagation()
                            api.moveWidgetTo(id, column.id, column.widgets.indexOf(widget))
                          }}
                          className={cn(
                            'group flex cursor-grab items-center gap-1.5 rounded-md px-1.5 py-1 active:cursor-grabbing',
                            api.selectedId === widget.id ? 'bg-sky-100 text-sky-900' : 'text-neutral-700 hover:bg-neutral-100',
                          )}
                          onClick={() => api.select(widget.id)}
                        >
                          <GripVertical className="h-3 w-3 shrink-0 text-neutral-300 group-hover:text-neutral-500" />
                          <span className="shrink-0 font-medium">{Label}</span>
                          {preview && <span className="truncate opacity-60">{preview}</span>}
                          <span className="ml-auto">
                            <HiddenMark node={widget} api={api} />
                          </span>
                        </div>
                      )
                    })}
                    {column.widgets.length === 0 && <p className="px-1.5 py-1 italic text-neutral-400">Empty</p>}
                  </div>
                </div>
              ))}
          </div>
        )
      })}
    </div>
  )
}
