'use client'

import { useCallback, useMemo, useReducer, useRef } from 'react'

import { LIMITS } from '@/lib/hero-builder/constants'
import { cloneWithNewIds, createSection, createWidget } from '@/lib/hero-builder/defaults'
import { editorReducer, initialEditorState } from '@/lib/hero-builder/editor-state'
import {
  findNode,
  insertionPointFor,
  insertSection,
  insertWidget,
  moveNodeBy,
  moveSection,
  moveWidget,
  removeNode,
  resetDeviceOverrides,
  setAnimation,
  setColumnLayout,
  updateContent,
  updateSectionMeta,
  updateStyle,
  updateTheme,
} from '@/lib/hero-builder/tree-ops'
import type {
  Animation,
  Column,
  Device,
  HeroDesignV5,
  NodeStyle,
  Section,
  Theme,
  Widget,
  WidgetContent,
  WidgetKind,
} from '@/lib/hero-builder/types'

export interface HeroBuilderApi {
  design: HeroDesignV5
  selectedId: string | null
  device: Device
  canUndo: boolean
  canRedo: boolean
  select: (id: string | null) => void
  setDevice: (device: Device) => void
  undo: () => void
  redo: () => void
  replaceDesign: (design: HeroDesignV5) => void
  /** Style edit at the current device. `key` groups slider drags into one undo step. */
  editStyle: (id: string, patch: Partial<NodeStyle>, key?: string) => void
  resetOverrides: (id: string) => void
  editContent: (id: string, patch: Partial<WidgetContent>, key?: string) => void
  editAnimation: (id: string, animation: Animation | undefined) => void
  editSectionMeta: (id: string, meta: { label?: string; anchor?: string }, key?: string) => void
  editTheme: (patch: Partial<Theme>, key?: string) => void
  addWidget: (kind: WidgetKind, target?: { columnId: string; index: number }) => void
  addSection: (section?: Section, index?: number) => void
  setColumns: (sectionId: string, widths: readonly number[]) => void
  remove: (id: string) => void
  duplicate: (id: string) => void
  moveBy: (id: string, delta: -1 | 1) => void
  moveWidgetTo: (widgetId: string, columnId: string, index: number) => void
  moveSectionTo: (sectionId: string, index: number) => void
}

export function useHeroBuilder(initialDesign: HeroDesignV5): HeroBuilderApi {
  const [state, dispatch] = useReducer(editorReducer, initialDesign, initialEditorState)
  // Discrete commands (duplicate/paste) read the latest committed state.
  const stateRef = useRef(state)
  stateRef.current = state
  const device = state.device

  const apply = useCallback(
    (update: (d: HeroDesignV5) => HeroDesignV5, opts: { select?: string | null; key?: string } = {}) =>
      dispatch({ type: 'apply', update, select: opts.select, coalesceKey: opts.key, now: Date.now() }),
    [],
  )

  const select = useCallback((id: string | null) => dispatch({ type: 'select', id }), [])
  const setDevice = useCallback((d: Device) => dispatch({ type: 'device', device: d }), [])
  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])
  const replaceDesign = useCallback((design: HeroDesignV5) => dispatch({ type: 'replace', design }), [])

  const editStyle = useCallback(
    (id: string, patch: Partial<NodeStyle>, key?: string) =>
      apply((d) => updateStyle(d, id, device, patch), { key: key ? `style:${id}:${device}:${key}` : undefined }),
    [apply, device],
  )
  const resetOverrides = useCallback(
    (id: string) => {
      if (device !== 'desktop') apply((d) => resetDeviceOverrides(d, id, device))
    },
    [apply, device],
  )
  const editContent = useCallback(
    (id: string, patch: Partial<WidgetContent>, key?: string) =>
      apply((d) => updateContent(d, id, patch), { key: key ? `content:${id}:${key}` : undefined }),
    [apply],
  )
  const editAnimation = useCallback(
    (id: string, animation: Animation | undefined) => apply((d) => setAnimation(d, id, animation), { key: `anim:${id}` }),
    [apply],
  )
  const editSectionMeta = useCallback(
    (id: string, meta: { label?: string; anchor?: string }, key?: string) =>
      apply((d) => updateSectionMeta(d, id, meta), { key: key ? `meta:${id}:${key}` : undefined }),
    [apply],
  )
  const editTheme = useCallback(
    (patch: Partial<Theme>, key?: string) => apply((d) => updateTheme(d, patch), { key: key ? `theme:${key}` : undefined }),
    [apply],
  )

  const addWidget = useCallback(
    (kind: WidgetKind, target?: { columnId: string; index: number }) => {
      const widget = createWidget(kind)
      const current = stateRef.current
      let design = current.design
      let point = target ?? insertionPointFor(design, current.selectedId)
      if (!point) {
        const section = createSection([100], 'Section')
        design = insertSection(design, section)
        point = { columnId: section.columns[0].id, index: 0 }
      }
      const at = point
      const base = design
      apply(() => insertWidget(base, at.columnId, widget, at.index), { select: widget.id })
    },
    [apply],
  )

  const addSection = useCallback(
    (section?: Section, index?: number) => {
      const node = section ? cloneWithNewIds(section) : createSection([100], 'Section')
      const current = stateRef.current
      const found = findNode(current.design, current.selectedId)
      const at = index ?? (found ? current.design.sections.findIndex((s) => s.id === found.sectionId) + 1 : undefined)
      apply((d) => insertSection(d, node, at), { select: node.id })
    },
    [apply],
  )

  const setColumns = useCallback(
    (sectionId: string, widths: readonly number[]) => apply((d) => setColumnLayout(d, sectionId, widths)),
    [apply],
  )

  const remove = useCallback((id: string) => apply((d) => removeNode(d, id), { select: null }), [apply])

  const duplicate = useCallback(
    (id: string) => {
      const found = findNode(stateRef.current.design, id)
      if (!found) return
      if (found.kind === 'section') {
        const copy = cloneWithNewIds(found.node as Section)
        apply((d) => insertSection(d, copy, found.index + 1), { select: copy.id })
      } else if (found.kind === 'widget') {
        const copy = cloneWithNewIds(found.node as Widget)
        apply((d) => insertWidget(d, found.parentId!, copy, found.index + 1), { select: copy.id })
      } else {
        const copy = cloneWithNewIds(found.node as Column)
        apply(
          (d) => {
            const section = d.sections.find((s) => s.id === found.sectionId)
            if (!section || section.columns.length >= LIMITS.columnsPerSection) return d
            const columns = [...section.columns]
            columns.splice(found.index + 1, 0, copy)
            return { ...d, sections: d.sections.map((s) => (s.id === section.id ? { ...s, columns } : s)) }
          },
          { select: copy.id },
        )
      }
    },
    [apply],
  )

  const moveBy = useCallback((id: string, delta: -1 | 1) => apply((d) => moveNodeBy(d, id, delta)), [apply])
  const moveWidgetTo = useCallback(
    (widgetId: string, columnId: string, index: number) => apply((d) => moveWidget(d, widgetId, columnId, index)),
    [apply],
  )
  const moveSectionTo = useCallback(
    (sectionId: string, index: number) => apply((d) => moveSection(d, sectionId, index)),
    [apply],
  )

  return useMemo(
    () => ({
      design: state.design,
      selectedId: state.selectedId,
      device: state.device,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      select, setDevice, undo, redo, replaceDesign, editStyle, resetOverrides, editContent, editAnimation,
      editSectionMeta, editTheme, addWidget, addSection, setColumns, remove, duplicate, moveBy, moveWidgetTo, moveSectionTo,
    }),
    [
      state, select, setDevice, undo, redo, replaceDesign, editStyle, resetOverrides, editContent, editAnimation,
      editSectionMeta, editTheme, addWidget, addSection, setColumns, remove, duplicate, moveBy, moveWidgetTo, moveSectionTo,
    ],
  )
}
