// ---------------------------------------------------------------------------
// Immutable edits on a design. Every function returns a new design and leaves
// the input untouched, so the editor's undo history can hold plain snapshots.
// ---------------------------------------------------------------------------

import { LIMITS } from './constants'
import { cloneWithNewIds, createColumn } from './defaults'
import type {
  Animation,
  Column,
  Device,
  HeroDesignV5,
  NodeKind,
  NodeStyle,
  Section,
  Theme,
  Widget,
  WidgetContent,
} from './types'

export interface FoundNode {
  kind: NodeKind
  node: Section | Column | Widget
  sectionId: string
  columnId?: string
  index: number
  parentId: string | null
}

export function findNode(design: HeroDesignV5, id: string | null | undefined): FoundNode | null {
  if (!id) return null
  for (const [si, section] of design.sections.entries()) {
    if (section.id === id) return { kind: 'section', node: section, sectionId: section.id, index: si, parentId: null }
    for (const [ci, column] of section.columns.entries()) {
      if (column.id === id) {
        return { kind: 'column', node: column, sectionId: section.id, columnId: column.id, index: ci, parentId: section.id }
      }
      const wi = column.widgets.findIndex((w) => w.id === id)
      if (wi >= 0) {
        return {
          kind: 'widget',
          node: column.widgets[wi],
          sectionId: section.id,
          columnId: column.id,
          index: wi,
          parentId: column.id,
        }
      }
    }
  }
  return null
}

export function countWidgets(design: HeroDesignV5): number {
  return design.sections.reduce((n, s) => n + s.columns.reduce((m, c) => m + c.widgets.length, 0), 0)
}

type NodeUpdater = <T extends Section | Column | Widget>(node: T) => T

function mapNode(design: HeroDesignV5, id: string, update: NodeUpdater): HeroDesignV5 {
  let changed = false
  const sections = design.sections.map((section) => {
    if (section.id === id) {
      changed = true
      return update(section)
    }
    let sectionChanged = false
    const columns = section.columns.map((column) => {
      if (column.id === id) {
        sectionChanged = true
        return update(column)
      }
      const wi = column.widgets.findIndex((w) => w.id === id)
      if (wi < 0) return column
      sectionChanged = true
      return { ...column, widgets: column.widgets.map((w, i) => (i === wi ? update(w) : w)) }
    })
    if (!sectionChanged) return section
    changed = true
    return { ...section, columns }
  })
  return changed ? { ...design, sections } : design
}

/**
 * Merge `patch` into the node's style layer for `device`. A key set to
 * `undefined` is removed from that layer (on tablet/mobile that means
 * "inherit again").
 */
export function updateStyle(design: HeroDesignV5, id: string, device: Device, patch: Partial<NodeStyle>): HeroDesignV5 {
  return mapNode(design, id, (node) => {
    const current = (device === 'desktop' ? node.style : node[device]) ?? {}
    const next: Record<string, unknown> = { ...current }
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete next[key]
      else next[key] = value
    }
    if (device === 'desktop') return { ...node, style: next as NodeStyle }
    if (Object.keys(next).length === 0) {
      const { [device]: _dropped, ...rest } = node
      void _dropped
      return rest as typeof node
    }
    return { ...node, [device]: next as NodeStyle }
  })
}

export function resetDeviceOverrides(design: HeroDesignV5, id: string, device: Exclude<Device, 'desktop'>): HeroDesignV5 {
  return mapNode(design, id, (node) => {
    const { [device]: _dropped, ...rest } = node
    void _dropped
    return rest as typeof node
  })
}

export function updateContent(design: HeroDesignV5, id: string, patch: Partial<WidgetContent>): HeroDesignV5 {
  return mapNode(design, id, (node) => {
    if (!('content' in node)) return node
    return { ...node, content: { ...node.content, ...patch, kind: node.content.kind } as WidgetContent }
  })
}

export function setAnimation(design: HeroDesignV5, id: string, animation: Animation | undefined): HeroDesignV5 {
  return mapNode(design, id, (node) => {
    if (!('content' in node)) return node
    if (!animation || animation.type === 'none') {
      const { animation: _dropped, ...rest } = node
      void _dropped
      return rest as typeof node
    }
    return { ...node, animation }
  })
}

export function updateSectionMeta(design: HeroDesignV5, id: string, meta: { label?: string; anchor?: string }): HeroDesignV5 {
  return mapNode(design, id, (node) => ('columns' in node ? { ...node, ...meta } : node))
}

export function updateTheme(design: HeroDesignV5, patch: Partial<Theme>): HeroDesignV5 {
  return { ...design, theme: { ...design.theme, ...patch, colors: { ...design.theme.colors, ...(patch.colors ?? {}) } } }
}

export function insertSection(design: HeroDesignV5, section: Section, index = design.sections.length): HeroDesignV5 {
  if (design.sections.length >= LIMITS.sections) return design
  const sections = [...design.sections]
  sections.splice(Math.max(0, Math.min(index, sections.length)), 0, section)
  return { ...design, sections }
}

export function insertWidget(design: HeroDesignV5, columnId: string, widget: Widget, index?: number): HeroDesignV5 {
  if (countWidgets(design) >= LIMITS.widgetsTotal) return design
  return mapNode(design, columnId, (node) => {
    if (!('widgets' in node)) return node
    const widgets = [...node.widgets]
    const at = index === undefined ? widgets.length : Math.max(0, Math.min(index, widgets.length))
    widgets.splice(at, 0, widget)
    return { ...node, widgets }
  })
}

export function removeNode(design: HeroDesignV5, id: string): HeroDesignV5 {
  const found = findNode(design, id)
  if (!found) return design
  if (found.kind === 'section') return { ...design, sections: design.sections.filter((s) => s.id !== id) }
  if (found.kind === 'column') {
    const section = design.sections.find((s) => s.id === found.sectionId)
    // A section always keeps at least one column.
    if (!section || section.columns.length <= 1) return design
    return mapNode(design, section.id, (node) =>
      'columns' in node ? { ...node, columns: node.columns.filter((c) => c.id !== id) } : node,
    )
  }
  return mapNode(design, found.parentId!, (node) =>
    'widgets' in node ? { ...node, widgets: node.widgets.filter((w) => w.id !== id) } : node,
  )
}

/** Duplicate a node right after itself. Returns the copy's id (null when refused). */
export function duplicateNode(design: HeroDesignV5, id: string): { design: HeroDesignV5; newId: string | null } {
  const found = findNode(design, id)
  if (!found) return { design, newId: null }
  if (found.kind === 'section') {
    const copy = cloneWithNewIds(found.node as Section)
    const next = insertSection(design, copy, found.index + 1)
    return next === design ? { design, newId: null } : { design: next, newId: copy.id }
  }
  if (found.kind === 'widget') {
    const copy = cloneWithNewIds(found.node as Widget)
    const next = insertWidget(design, found.parentId!, copy, found.index + 1)
    return next === design ? { design, newId: null } : { design: next, newId: copy.id }
  }
  const section = design.sections.find((s) => s.id === found.sectionId)
  if (!section || section.columns.length >= LIMITS.columnsPerSection) return { design, newId: null }
  const copy = cloneWithNewIds(found.node as Column)
  const columns = [...section.columns]
  columns.splice(found.index + 1, 0, copy)
  return { design: mapNode(design, section.id, (n) => ({ ...n, columns })), newId: copy.id }
}

function moveInArray<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item)
  return next
}

/** Move a section, column or widget one step up (-1) or down (+1) among its siblings. */
export function moveNodeBy(design: HeroDesignV5, id: string, delta: -1 | 1): HeroDesignV5 {
  const found = findNode(design, id)
  if (!found) return design
  const to = found.index + delta
  if (found.kind === 'section') {
    if (to < 0 || to >= design.sections.length) return design
    return { ...design, sections: moveInArray(design.sections, found.index, to) }
  }
  const parentId = found.kind === 'column' ? found.sectionId : found.parentId!
  return mapNode(design, parentId, (node) => {
    if (found.kind === 'column' && 'columns' in node) {
      if (to < 0 || to >= node.columns.length) return node
      return { ...node, columns: moveInArray(node.columns, found.index, to) }
    }
    if ('widgets' in node) {
      if (to < 0 || to >= node.widgets.length) return node
      return { ...node, widgets: moveInArray(node.widgets, found.index, to) }
    }
    return node
  })
}

export function moveSection(design: HeroDesignV5, id: string, toIndex: number): HeroDesignV5 {
  const from = design.sections.findIndex((s) => s.id === id)
  if (from < 0) return design
  return { ...design, sections: moveInArray(design.sections, from, toIndex) }
}

/** Move a widget to `toIndex` in `toColumnId` (same or another column). */
export function moveWidget(design: HeroDesignV5, widgetId: string, toColumnId: string, toIndex: number): HeroDesignV5 {
  const found = findNode(design, widgetId)
  const target = findNode(design, toColumnId)
  if (!found || found.kind !== 'widget' || !target || target.kind !== 'column') return design
  const widget = found.node as Widget
  if (found.parentId === toColumnId) {
    const adjusted = toIndex > found.index ? toIndex - 1 : toIndex
    return mapNode(design, toColumnId, (node) =>
      'widgets' in node ? { ...node, widgets: moveInArray(node.widgets, found.index, adjusted) } : node,
    )
  }
  const without = removeNode(design, widgetId)
  return mapNode(without, toColumnId, (node) => {
    if (!('widgets' in node)) return node
    const widgets = [...node.widgets]
    widgets.splice(Math.max(0, Math.min(toIndex, widgets.length)), 0, widget)
    return { ...node, widgets }
  })
}

/**
 * Re-cut a section into `widths.length` columns. Existing columns keep their
 * widgets in order; widgets of dropped columns move into the last kept one.
 */
export function setColumnLayout(design: HeroDesignV5, sectionId: string, widths: readonly number[]): HeroDesignV5 {
  if (widths.length < 1 || widths.length > LIMITS.columnsPerSection) return design
  return mapNode(design, sectionId, (node) => {
    if (!('columns' in node)) return node
    const kept = node.columns.slice(0, widths.length).map((column, i) => ({
      ...column,
      style: { ...column.style, width: widths[i] },
    }))
    const overflow = node.columns.slice(widths.length).flatMap((c) => c.widgets)
    if (overflow.length && kept.length) {
      const last = kept[kept.length - 1]
      kept[kept.length - 1] = { ...last, widgets: [...last.widgets, ...overflow] }
    }
    const added = widths.slice(kept.length).map((w) => createColumn(w))
    return { ...node, columns: [...kept, ...added] }
  })
}

/** Where a new widget goes given the current selection. */
export function insertionPointFor(
  design: HeroDesignV5,
  selectedId: string | null,
): { columnId: string; index: number } | null {
  const found = findNode(design, selectedId)
  if (found?.kind === 'widget') return { columnId: found.parentId!, index: found.index + 1 }
  if (found?.kind === 'column') return { columnId: found.node.id, index: (found.node as Column).widgets.length }
  const section =
    found?.kind === 'section' ? (found.node as Section) : design.sections[design.sections.length - 1]
  const column = section?.columns[0]
  return column ? { columnId: column.id, index: column.widgets.length } : null
}
