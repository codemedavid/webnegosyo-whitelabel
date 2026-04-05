'use client'

import { useCallback, useMemo, useReducer } from 'react'
import { v4 as uuidv4 } from 'uuid'

import {
  createBlankBlockDesign,
  createColumn,
  createSection,
  widgetFactories,
} from '@/lib/hero-block-defaults'
import type {
  BlockColumn,
  BlockDesignerState,
  BlockSection,
  BlockSelection,
  BlockWidget,
  BlockWidgetType,
  Breakpoint,
  ColumnSettings,
  ElementAnimation,
  GlobalStyles,
  HeroBlockDesign,
  SectionSettings,
  WidgetProps,
} from '@/types/hero-block-designer'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_HISTORY = 50

// ---------------------------------------------------------------------------
// Action types (discriminated union)
// ---------------------------------------------------------------------------

export type BlockDesignerAction =
  | { type: 'SET_DESIGN'; design: HeroBlockDesign }
  // Section
  | { type: 'ADD_SECTION'; columnWidths: number[]; afterIndex?: number }
  | { type: 'REMOVE_SECTION'; sectionId: string }
  | { type: 'DUPLICATE_SECTION'; sectionId: string }
  | { type: 'REORDER_SECTIONS'; sectionIds: string[] }
  | { type: 'UPDATE_SECTION_SETTINGS'; sectionId: string; settings: Partial<SectionSettings>; breakpoint?: Breakpoint }
  | { type: 'RENAME_SECTION'; sectionId: string; label: string }
  // Column
  | { type: 'SET_COLUMN_LAYOUT'; sectionId: string; widths: number[] }
  | { type: 'UPDATE_COLUMN_SETTINGS'; sectionId: string; columnId: string; settings: Partial<ColumnSettings>; breakpoint?: Breakpoint }
  // Widget
  | { type: 'ADD_WIDGET'; sectionId: string; columnId: string; widgetType: BlockWidgetType; atIndex?: number }
  | { type: 'REMOVE_WIDGET'; sectionId: string; columnId: string; widgetId: string }
  | { type: 'DUPLICATE_WIDGET'; sectionId: string; columnId: string; widgetId: string }
  | { type: 'REORDER_WIDGETS'; sectionId: string; columnId: string; widgetIds: string[] }
  | { type: 'MOVE_WIDGET'; fromSectionId: string; fromColumnId: string; widgetId: string; toSectionId: string; toColumnId: string; toIndex: number }
  | { type: 'UPDATE_WIDGET_PROPS'; sectionId: string; columnId: string; widgetId: string; props: Partial<WidgetProps>; breakpoint?: Breakpoint }
  | { type: 'UPDATE_WIDGET_SETTINGS'; sectionId: string; columnId: string; widgetId: string; settings: Partial<Pick<BlockWidget, 'alignment' | 'width' | 'margin' | 'padding' | 'background' | 'visibility'>>; breakpoint?: Breakpoint }
  | { type: 'UPDATE_WIDGET_ANIMATION'; sectionId: string; columnId: string; widgetId: string; animation: Partial<ElementAnimation> }
  // Global
  | { type: 'UPDATE_GLOBAL_STYLES'; styles: Partial<GlobalStyles> }
  | { type: 'SELECT_BLOCK'; selection: BlockSelection | null }
  | { type: 'SET_BREAKPOINT'; breakpoint: Breakpoint }
  // History
  | { type: 'UNDO' }
  | { type: 'REDO' }

// ---------------------------------------------------------------------------
// Helpers — History
// ---------------------------------------------------------------------------

function pushHistory(state: BlockDesignerState): BlockDesignerState {
  const historyCopy = state.history.slice(0, state.historyIndex + 1)
  historyCopy.push(structuredClone(state.design))
  if (historyCopy.length > MAX_HISTORY) {
    historyCopy.shift()
  }
  return {
    ...state,
    history: historyCopy,
    historyIndex: historyCopy.length - 1,
  }
}

// ---------------------------------------------------------------------------
// Helpers — Immutable updaters
// ---------------------------------------------------------------------------

function updateSection(
  design: HeroBlockDesign,
  sectionId: string,
  fn: (section: BlockSection) => BlockSection,
): HeroBlockDesign {
  return {
    ...design,
    sections: design.sections.map((s) =>
      s.id === sectionId ? fn(s) : s,
    ),
  }
}

function updateColumn(
  design: HeroBlockDesign,
  sectionId: string,
  columnId: string,
  fn: (column: BlockColumn) => BlockColumn,
): HeroBlockDesign {
  return updateSection(design, sectionId, (section) => ({
    ...section,
    columns: section.columns.map((c) =>
      c.id === columnId ? fn(c) : c,
    ),
  }))
}

function updateWidget(
  design: HeroBlockDesign,
  sectionId: string,
  columnId: string,
  widgetId: string,
  fn: (widget: BlockWidget) => BlockWidget,
): HeroBlockDesign {
  return updateColumn(design, sectionId, columnId, (column) => ({
    ...column,
    widgets: column.widgets.map((w) =>
      w.id === widgetId ? fn(w) : w,
    ),
  }))
}

// ---------------------------------------------------------------------------
// Helpers — Deep clone with new IDs
// ---------------------------------------------------------------------------

function deepCloneWidget(widget: BlockWidget): BlockWidget {
  const cloned = structuredClone(widget)
  cloned.id = uuidv4()
  return cloned
}

function deepCloneColumn(column: BlockColumn): BlockColumn {
  const cloned = structuredClone(column)
  cloned.id = uuidv4()
  cloned.widgets = cloned.widgets.map((w) => deepCloneWidget(w))
  return cloned
}

function deepCloneSection(section: BlockSection): BlockSection {
  const cloned = structuredClone(section)
  cloned.id = uuidv4()
  cloned.columns = cloned.columns.map((c) => deepCloneColumn(c))
  return cloned
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function blockDesignerReducer(
  state: BlockDesignerState,
  action: BlockDesignerAction,
): BlockDesignerState {
  switch (action.type) {
    // ── Design ────────────────────────────────────────────────────────────
    case 'SET_DESIGN': {
      const design = structuredClone(action.design)
      return {
        ...state,
        design,
        selection: null,
        history: [],
        historyIndex: -1,
      }
    }

    // ── Section ──────────────────────────────────────────────────────────
    case 'ADD_SECTION': {
      const s = pushHistory(state)
      const newSection = createSection(action.columnWidths)
      const sections = [...s.design.sections]
      const insertAt = action.afterIndex !== undefined ? action.afterIndex + 1 : sections.length
      sections.splice(insertAt, 0, newSection)
      return {
        ...s,
        design: { ...s.design, sections },
        selection: { type: 'section', sectionId: newSection.id },
      }
    }

    case 'REMOVE_SECTION': {
      const s = pushHistory(state)
      const sections = s.design.sections.filter((sec) => sec.id !== action.sectionId)
      const selection =
        s.selection?.sectionId === action.sectionId ? null : s.selection
      return {
        ...s,
        design: { ...s.design, sections },
        selection,
      }
    }

    case 'DUPLICATE_SECTION': {
      const original = state.design.sections.find((sec) => sec.id === action.sectionId)
      if (!original) return state

      const s = pushHistory(state)
      const cloned = deepCloneSection(original)
      cloned.label = `${original.label} (copy)`

      const sections = [...s.design.sections]
      const originalIndex = sections.findIndex((sec) => sec.id === action.sectionId)
      sections.splice(originalIndex + 1, 0, cloned)

      return {
        ...s,
        design: { ...s.design, sections },
        selection: { type: 'section', sectionId: cloned.id },
      }
    }

    case 'REORDER_SECTIONS': {
      const s = pushHistory(state)
      const sectionMap = new Map(s.design.sections.map((sec) => [sec.id, sec]))
      const reordered = action.sectionIds
        .map((id) => sectionMap.get(id))
        .filter((sec): sec is BlockSection => sec !== undefined)
      return {
        ...s,
        design: { ...s.design, sections: reordered },
      }
    }

    case 'UPDATE_SECTION_SETTINGS': {
      const s = pushHistory(state)
      const breakpoint = action.breakpoint ?? 'desktop'
      if (breakpoint === 'desktop') {
        return {
          ...s,
          design: updateSection(s.design, action.sectionId, (section) => ({
            ...section,
            settings: { ...section.settings, ...action.settings },
          })),
        }
      }
      return {
        ...s,
        design: updateSection(s.design, action.sectionId, (section) => ({
          ...section,
          responsiveOverrides: {
            ...section.responsiveOverrides,
            [breakpoint]: {
              ...section.responsiveOverrides?.[breakpoint],
              ...action.settings,
            },
          },
        })),
      }
    }

    case 'RENAME_SECTION': {
      const s = pushHistory(state)
      return {
        ...s,
        design: updateSection(s.design, action.sectionId, (section) => ({
          ...section,
          label: action.label,
        })),
      }
    }

    // ── Column ───────────────────────────────────────────────────────────
    case 'SET_COLUMN_LAYOUT': {
      const s = pushHistory(state)
      return {
        ...s,
        design: updateSection(s.design, action.sectionId, (section) => {
          // Collect all widgets from all columns
          const allWidgets = section.columns.flatMap((c) => c.widgets)
          // Create new columns with specified widths
          const newColumns = action.widths.map((w, i) => {
            const col = createColumn(w)
            // Put all existing widgets into the first new column
            if (i === 0) {
              col.widgets = allWidgets
            }
            return col
          })
          return { ...section, columns: newColumns }
        }),
      }
    }

    case 'UPDATE_COLUMN_SETTINGS': {
      const s = pushHistory(state)
      const breakpoint = action.breakpoint ?? 'desktop'
      if (breakpoint === 'desktop') {
        return {
          ...s,
          design: updateColumn(s.design, action.sectionId, action.columnId, (column) => ({
            ...column,
            settings: { ...column.settings, ...action.settings },
          })),
        }
      }
      return {
        ...s,
        design: updateColumn(s.design, action.sectionId, action.columnId, (column) => ({
          ...column,
          responsiveOverrides: {
            ...column.responsiveOverrides,
            [breakpoint]: {
              ...column.responsiveOverrides?.[breakpoint],
              ...action.settings,
            },
          },
        })),
      }
    }

    // ── Widget ───────────────────────────────────────────────────────────
    case 'ADD_WIDGET': {
      const s = pushHistory(state)
      const factory = widgetFactories[action.widgetType]
      const newWidget = factory()
      const design = updateColumn(s.design, action.sectionId, action.columnId, (column) => {
        const widgets = [...column.widgets]
        const insertAt = action.atIndex !== undefined ? action.atIndex : widgets.length
        widgets.splice(insertAt, 0, newWidget)
        return { ...column, widgets }
      })
      return {
        ...s,
        design,
        selection: {
          type: 'widget',
          sectionId: action.sectionId,
          columnId: action.columnId,
          widgetId: newWidget.id,
        },
      }
    }

    case 'REMOVE_WIDGET': {
      const s = pushHistory(state)
      const design = updateColumn(s.design, action.sectionId, action.columnId, (column) => ({
        ...column,
        widgets: column.widgets.filter((w) => w.id !== action.widgetId),
      }))
      const selection =
        s.selection?.widgetId === action.widgetId ? null : s.selection
      return { ...s, design, selection }
    }

    case 'DUPLICATE_WIDGET': {
      const section = state.design.sections.find((sec) => sec.id === action.sectionId)
      const column = section?.columns.find((c) => c.id === action.columnId)
      const original = column?.widgets.find((w) => w.id === action.widgetId)
      if (!original) return state

      const s = pushHistory(state)
      const cloned = deepCloneWidget(original)
      cloned.label = `${original.label} (copy)`

      const design = updateColumn(s.design, action.sectionId, action.columnId, (col) => {
        const widgets = [...col.widgets]
        const originalIndex = widgets.findIndex((w) => w.id === action.widgetId)
        widgets.splice(originalIndex + 1, 0, cloned)
        return { ...col, widgets }
      })
      return {
        ...s,
        design,
        selection: {
          type: 'widget',
          sectionId: action.sectionId,
          columnId: action.columnId,
          widgetId: cloned.id,
        },
      }
    }

    case 'REORDER_WIDGETS': {
      const s = pushHistory(state)
      const design = updateColumn(s.design, action.sectionId, action.columnId, (column) => {
        const widgetMap = new Map(column.widgets.map((w) => [w.id, w]))
        const reordered = action.widgetIds
          .map((id) => widgetMap.get(id))
          .filter((w): w is BlockWidget => w !== undefined)
        return { ...column, widgets: reordered }
      })
      return { ...s, design }
    }

    case 'MOVE_WIDGET': {
      const s = pushHistory(state)
      // Find the widget to move
      let movedWidget: BlockWidget | undefined
      // Remove from source column
      let design = updateColumn(s.design, action.fromSectionId, action.fromColumnId, (column) => {
        movedWidget = column.widgets.find((w) => w.id === action.widgetId)
        return {
          ...column,
          widgets: column.widgets.filter((w) => w.id !== action.widgetId),
        }
      })
      if (!movedWidget) return state
      // Insert into target column
      const widgetToInsert = movedWidget
      design = updateColumn(design, action.toSectionId, action.toColumnId, (column) => {
        const widgets = [...column.widgets]
        widgets.splice(action.toIndex, 0, widgetToInsert)
        return { ...column, widgets }
      })
      return {
        ...s,
        design,
        selection: {
          type: 'widget',
          sectionId: action.toSectionId,
          columnId: action.toColumnId,
          widgetId: action.widgetId,
        },
      }
    }

    case 'UPDATE_WIDGET_PROPS': {
      const s = pushHistory(state)
      const breakpoint = action.breakpoint ?? 'desktop'
      if (breakpoint === 'desktop') {
        return {
          ...s,
          design: updateWidget(s.design, action.sectionId, action.columnId, action.widgetId, (widget) => ({
            ...widget,
            props: { ...widget.props, ...action.props } as WidgetProps,
          })),
        }
      }
      return {
        ...s,
        design: updateWidget(s.design, action.sectionId, action.columnId, action.widgetId, (widget) => ({
          ...widget,
          responsiveOverrides: {
            ...widget.responsiveOverrides,
            [breakpoint]: {
              ...widget.responsiveOverrides?.[breakpoint],
              props: {
                ...widget.responsiveOverrides?.[breakpoint]?.props,
                ...action.props,
              },
            },
          },
        })),
      }
    }

    case 'UPDATE_WIDGET_SETTINGS': {
      const s = pushHistory(state)
      const breakpoint = action.breakpoint ?? 'desktop'
      if (breakpoint === 'desktop') {
        return {
          ...s,
          design: updateWidget(s.design, action.sectionId, action.columnId, action.widgetId, (widget) => ({
            ...widget,
            ...action.settings,
          })),
        }
      }
      return {
        ...s,
        design: updateWidget(s.design, action.sectionId, action.columnId, action.widgetId, (widget) => ({
          ...widget,
          responsiveOverrides: {
            ...widget.responsiveOverrides,
            [breakpoint]: {
              ...widget.responsiveOverrides?.[breakpoint],
              ...action.settings,
            },
          },
        })),
      }
    }

    case 'UPDATE_WIDGET_ANIMATION': {
      const s = pushHistory(state)
      return {
        ...s,
        design: updateWidget(s.design, action.sectionId, action.columnId, action.widgetId, (widget) => ({
          ...widget,
          animation: { ...widget.animation, ...action.animation },
        })),
      }
    }

    // ── Global ───────────────────────────────────────────────────────────
    case 'UPDATE_GLOBAL_STYLES': {
      const s = pushHistory(state)
      return {
        ...s,
        design: {
          ...s.design,
          globalStyles: { ...s.design.globalStyles, ...action.styles },
        },
      }
    }

    case 'SELECT_BLOCK': {
      return { ...state, selection: action.selection }
    }

    case 'SET_BREAKPOINT': {
      return { ...state, activeBreakpoint: action.breakpoint }
    }

    // ── History ──────────────────────────────────────────────────────────
    case 'UNDO': {
      if (state.historyIndex < 0) return state
      // When undoing from the tip, save the current design so REDO can restore it
      let history = state.history
      if (state.historyIndex === history.length - 1) {
        history = [...history, structuredClone(state.design)]
      }
      return {
        ...state,
        history,
        design: structuredClone(history[state.historyIndex]),
        historyIndex: state.historyIndex - 1,
      }
    }

    case 'REDO': {
      if (state.historyIndex + 2 >= state.history.length) return state
      return {
        ...state,
        design: structuredClone(state.history[state.historyIndex + 2]),
        historyIndex: state.historyIndex + 1,
      }
    }

    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

function initState(initialDesign?: HeroBlockDesign): BlockDesignerState {
  const design = initialDesign
    ? structuredClone(initialDesign)
    : createBlankBlockDesign()
  return {
    design,
    selection: null,
    history: [],
    historyIndex: -1,
    activeBreakpoint: 'desktop',
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useHeroBlockDesigner(initialDesign?: HeroBlockDesign) {
  const [state, dispatch] = useReducer(
    blockDesignerReducer,
    initialDesign,
    initState,
  )

  const canUndo = state.historyIndex >= 0
  const canRedo = state.historyIndex + 2 < state.history.length

  const selectedSection = useMemo(() => {
    if (!state.selection) return null
    return (
      state.design.sections.find((s) => s.id === state.selection?.sectionId) ??
      null
    )
  }, [state.design.sections, state.selection])

  const selectedColumn = useMemo(() => {
    if (!state.selection?.columnId || !selectedSection) return null
    return (
      selectedSection.columns.find((c) => c.id === state.selection?.columnId) ??
      null
    )
  }, [selectedSection, state.selection])

  const selectedWidget = useMemo(() => {
    if (!state.selection?.widgetId || !selectedColumn) return null
    return (
      selectedColumn.widgets.find((w) => w.id === state.selection?.widgetId) ??
      null
    )
  }, [selectedColumn, state.selection])

  const undo = useCallback(() => dispatch({ type: 'UNDO' }), [])
  const redo = useCallback(() => dispatch({ type: 'REDO' }), [])

  return {
    state,
    dispatch,
    canUndo,
    canRedo,
    selectedWidget,
    selectedSection,
    selectedColumn,
    undo,
    redo,
  }
}
