'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { ArrowDown, ArrowUp, Copy, CornerLeftUp, GripVertical, Plus, Trash2 } from 'lucide-react'

import { CANVAS_WIDTH } from '@/lib/hero-builder/constants'
import { WIDGET_DEFAULTS } from '@/lib/hero-builder/defaults'
import { findNode } from '@/lib/hero-builder/tree-ops'
import type { Section, Widget, WidgetKind } from '@/lib/hero-builder/types'
import { HeroBuilderRenderer } from '@/components/hero-builder/renderer/hero-builder-renderer'

import type { HeroBuilderApi } from './use-hero-builder'

export const DRAG_NEW = 'application/x-hb-new'
export const DRAG_MOVE = 'application/x-hb-move'

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

interface DropTarget {
  columnId: string
  index: number
  line: Rect
}

interface CanvasProps {
  api: HeroBuilderApi
  onEditContent: () => void
  onOpenAdd: () => void
}

function labelFor(api: HeroBuilderApi, id: string): string {
  const found = findNode(api.design, id)
  if (!found) return ''
  if (found.kind === 'section') return (found.node as Section).label || 'Section'
  if (found.kind === 'column') return `Column ${found.index + 1}`
  return WIDGET_DEFAULTS[(found.node as Widget).kind]?.label ?? 'Element'
}

export function Canvas({ api, onEditContent, onOpenAdd }: CanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [rects, setRects] = useState<{ selected: Rect | null; hover: Rect | null }>({ selected: null, hover: null })
  const [drop, setDrop] = useState<DropTarget | null>(null)
  const [scale, setScale] = useState(1)
  const [frameHeight, setFrameHeight] = useState(0)

  const frameWidth = CANVAS_WIDTH[api.device]

  // Fit the device frame into the available width without changing its layout width.
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const frame = frameRef.current
    if (!viewport || !frame) return
    const update = () => {
      const available = viewport.clientWidth - 48
      setScale(Math.min(1, available / frameWidth))
      setFrameHeight(frame.offsetHeight)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(viewport)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [frameWidth])

  const rectOf = useCallback((id: string | null): Rect | null => {
    if (!id || !frameRef.current || !stageRef.current) return null
    const el = frameRef.current.querySelector<HTMLElement>(`[data-hb-id="${CSS.escape(id)}"]`)
    if (!el) return null
    const r = el.getBoundingClientRect()
    const s = stageRef.current.getBoundingClientRect()
    return { top: r.top - s.top, left: r.left - s.left, width: r.width, height: r.height }
  }, [])

  const measure = useCallback(() => {
    setRects({ selected: rectOf(api.selectedId), hover: hoverId !== api.selectedId ? rectOf(hoverId) : null })
  }, [api.selectedId, hoverId, rectOf])

  useLayoutEffect(() => {
    measure()
  }, [measure, api.design, api.device, scale])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    // Images, fonts and embeds resize content after render.
    const observer = new ResizeObserver(() => measure())
    observer.observe(frame)
    return () => observer.disconnect()
  }, [measure])

  const nodeAt = (target: EventTarget | null): HTMLElement | null =>
    target instanceof Element ? (target.closest('[data-hb-id]') as HTMLElement | null) : null

  const handleClick = (event: MouseEvent) => {
    // Links and buttons inside the design must not navigate the editor away.
    if (event.target instanceof Element && event.target.closest('a')) event.preventDefault()
    const node = nodeAt(event.target)
    api.select(node?.dataset.hbId ?? null)
  }

  const handleDoubleClick = (event: MouseEvent) => {
    const node = nodeAt(event.target)
    if (node?.dataset.hbKind === 'widget') {
      api.select(node.dataset.hbId ?? null)
      onEditContent()
    }
  }

  // ── Drag & drop ────────────────────────────────────────────────────────────

  const computeDrop = (event: DragEvent): DropTarget | null => {
    const stage = stageRef.current
    if (!stage) return null
    const under = document.elementFromPoint(event.clientX, event.clientY)
    const column = under instanceof Element ? (under.closest('[data-hb-kind="column"]') as HTMLElement | null) : null
    if (!column?.dataset.hbId) return null
    const widgets = Array.from(column.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el.dataset.hbKind === 'widget',
    )
    const s = stage.getBoundingClientRect()
    const c = column.getBoundingClientRect()
    let index = widgets.length
    for (const [i, el] of widgets.entries()) {
      const r = el.getBoundingClientRect()
      if (event.clientY < r.top + r.height / 2) {
        index = i
        break
      }
    }
    const ref = widgets[index] ?? widgets[widgets.length - 1]
    const r = ref?.getBoundingClientRect()
    const y = !r ? c.top + c.height / 2 : index < widgets.length ? r.top - 2 : r.bottom + 2
    return { columnId: column.dataset.hbId, index, line: { top: y - s.top, left: c.left - s.left, width: c.width, height: 3 } }
  }

  const handleDragOver = (event: DragEvent) => {
    const types = event.dataTransfer.types
    if (!types.includes(DRAG_NEW) && !types.includes(DRAG_MOVE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = types.includes(DRAG_MOVE) ? 'move' : 'copy'
    setDrop(computeDrop(event))
  }

  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    const target = computeDrop(event)
    setDrop(null)
    if (!target) return
    const kind = event.dataTransfer.getData(DRAG_NEW) as WidgetKind
    const moveId = event.dataTransfer.getData(DRAG_MOVE)
    if (kind && WIDGET_DEFAULTS[kind]) api.addWidget(kind, { columnId: target.columnId, index: target.index })
    else if (moveId) api.moveWidgetTo(moveId, target.columnId, target.index)
  }

  const selected = findNode(api.design, api.selectedId)
  const selectedRect = rects.selected

  return (
    <div
      ref={viewportRef}
      className="relative h-full overflow-auto bg-[radial-gradient(circle,#d4d4d8_1px,transparent_1px)] bg-[length:18px_18px] bg-neutral-100"
      onScroll={measure}
    >
      <div className="flex min-h-full justify-center px-6 py-8">
        <div ref={stageRef} className="relative" style={{ width: frameWidth * scale, height: frameHeight * scale || undefined }}>
          <div
            ref={frameRef}
            className="origin-top-left overflow-hidden rounded-xl bg-[var(--brand-background,#fff)] shadow-[0_1px_2px_rgba(0,0,0,.06),0_12px_40px_rgba(15,23,42,.12)] ring-1 ring-black/5 transition-[width] duration-300"
            style={{ width: frameWidth, transform: scale < 1 ? `scale(${scale})` : undefined }}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onMouseOver={(e) => setHoverId(nodeAt(e.target)?.dataset.hbId ?? null)}
            onMouseLeave={() => setHoverId(null)}
            onDragOver={handleDragOver}
            onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDrop(null)}
            onDrop={handleDrop}
          >
            {api.design.sections.length === 0 ? (
              <button
                type="button"
                onClick={onOpenAdd}
                className="flex h-[420px] w-full flex-col items-center justify-center gap-3 text-neutral-500 hover:text-neutral-800"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-current">
                  <Plus className="h-5 w-5" />
                </span>
                <span className="text-sm font-medium">Start with a template or add a section</span>
              </button>
            ) : (
              <HeroBuilderRenderer design={api.design} isEditor />
            )}
          </div>

          {rects.hover && (
            <div className="pointer-events-none absolute z-10 rounded-sm ring-1 ring-sky-400/70" style={rects.hover} />
          )}
          {selectedRect && selected && (
            <>
              <div className="pointer-events-none absolute z-20 rounded-sm ring-2 ring-sky-500" style={selectedRect} />
              <div
                className="absolute z-30 flex items-center overflow-hidden rounded-md bg-sky-600 text-white shadow-lg"
                style={{ top: Math.max(0, selectedRect.top - 30), left: selectedRect.left }}
              >
                {selected.kind === 'widget' && (
                  <span
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_MOVE, selected.node.id)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    title="Drag to move"
                    className="flex h-7 cursor-grab items-center px-1 hover:bg-sky-700 active:cursor-grabbing"
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </span>
                )}
                <span className="px-2 text-[11px] font-semibold">{labelFor(api, selected.node.id)}</span>
                {selected.parentId !== null && (
                  <ToolbarButton title="Select parent" onClick={() => api.select(selected.parentId)}>
                    <CornerLeftUp className="h-3.5 w-3.5" />
                  </ToolbarButton>
                )}
                <ToolbarButton title="Move up" onClick={() => api.moveBy(selected.node.id, -1)}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </ToolbarButton>
                <ToolbarButton title="Move down" onClick={() => api.moveBy(selected.node.id, 1)}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </ToolbarButton>
                <ToolbarButton title="Duplicate (⌘D)" onClick={() => api.duplicate(selected.node.id)}>
                  <Copy className="h-3.5 w-3.5" />
                </ToolbarButton>
                <ToolbarButton title="Delete (Del)" onClick={() => api.remove(selected.node.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </ToolbarButton>
              </div>
            </>
          )}
          {drop && <div className="pointer-events-none absolute z-40 rounded-full bg-sky-500 shadow-[0_0_0_3px_rgba(14,165,233,.25)]" style={drop.line} />}
        </div>
      </div>
    </div>
  )
}

function ToolbarButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} className="flex h-7 w-7 items-center justify-center hover:bg-sky-700">
      {children}
    </button>
  )
}
