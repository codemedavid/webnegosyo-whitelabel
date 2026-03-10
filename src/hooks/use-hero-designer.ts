'use client'

import { useCallback, useReducer } from 'react'

import {
  createBlankDesign,
  createColumnElement,
  createRowElement,
  elementFactories,
  migrateDesign,
} from '@/lib/hero-designer-defaults'
import type {
  Breakpoint,
  DesignerState,
  ElementAnimation,
  ElementLayout,
  ElementProps,
  HeroDesign,
  HeroElement,
  HeroElementType,
} from '@/types/hero-designer'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_HISTORY = 50

// ---------------------------------------------------------------------------
// Action types (discriminated union)
// ---------------------------------------------------------------------------

export type DesignerAction =
  | { type: 'SET_DESIGN'; design: HeroDesign }
  | { type: 'ADD_ELEMENT'; elementType: HeroElementType }
  | { type: 'REMOVE_ELEMENT'; id: string }
  | { type: 'DUPLICATE_ELEMENT'; id: string }
  | { type: 'SELECT_ELEMENT'; id: string | null }
  | {
      type: 'UPDATE_ELEMENT_LAYOUT'
      id: string
      breakpoint: Breakpoint
      layout: Partial<ElementLayout>
    }
  | { type: 'UPDATE_ELEMENT_PROPS'; id: string; props: Partial<ElementProps>; breakpoint?: Breakpoint }
  | {
      type: 'UPDATE_ELEMENT_ANIMATION'
      id: string
      animation: Partial<ElementAnimation>
    }
  | {
      type: 'UPDATE_ELEMENT_META'
      id: string
      meta: Partial<Pick<HeroElement, 'label' | 'visible' | 'locked' | 'zIndex'>>
    }
  | { type: 'REORDER_ELEMENTS'; orderedIds: string[] }
  | { type: 'SET_BREAKPOINT'; breakpoint: Breakpoint }
  | { type: 'SET_ZOOM'; zoom: number }
  | { type: 'TOGGLE_GRID' }
  | {
      type: 'UPDATE_CANVAS'
      updates: Partial<
        Pick<HeroDesign, 'backgroundColor' | 'backgroundImage' | 'layoutMode'> & {
          desktopHeight: number
          mobileHeight: number
        }
      >
    }
  | { type: 'ADD_ROW_WITH_COLUMNS'; columnCount: number }
  | { type: 'MOVE_ELEMENT_TO_PARENT'; id: string; parentId: string | null }
  | { type: 'UNDO' }
  | { type: 'REDO' }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pushHistory(state: DesignerState): DesignerState {
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

function updateElement(
  design: HeroDesign,
  elementId: string,
  updater: (el: HeroElement) => HeroElement,
): HeroDesign {
  return {
    ...design,
    elements: design.elements.map((el) =>
      el.id === elementId ? updater(el) : el,
    ),
  }
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function designerReducer(
  state: DesignerState,
  action: DesignerAction,
): DesignerState {
  switch (action.type) {
    case 'SET_DESIGN': {
      const design = migrateDesign(structuredClone(action.design))
      return {
        ...state,
        design,
        selectedElementId: null,
        history: [structuredClone(design)],
        historyIndex: 0,
      }
    }

    case 'ADD_ELEMENT': {
      const stateWithHistory = pushHistory(state)
      const factory = elementFactories[action.elementType]
      const newElement = factory()
      return {
        ...stateWithHistory,
        design: {
          ...stateWithHistory.design,
          elements: [...stateWithHistory.design.elements, newElement],
        },
        selectedElementId: newElement.id,
      }
    }

    case 'REMOVE_ELEMENT': {
      const stateWithHistory = pushHistory(state)
      // Cascade delete: remove element and all its descendants
      const idsToRemove = new Set<string>([action.id])
      let changed = true
      while (changed) {
        changed = false
        for (const el of stateWithHistory.design.elements) {
          if (el.parentId && idsToRemove.has(el.parentId) && !idsToRemove.has(el.id)) {
            idsToRemove.add(el.id)
            changed = true
          }
        }
      }
      return {
        ...stateWithHistory,
        design: {
          ...stateWithHistory.design,
          elements: stateWithHistory.design.elements.filter(
            (el) => !idsToRemove.has(el.id),
          ),
        },
        selectedElementId:
          stateWithHistory.selectedElementId && idsToRemove.has(stateWithHistory.selectedElementId)
            ? null
            : stateWithHistory.selectedElementId,
      }
    }

    case 'DUPLICATE_ELEMENT': {
      const source = state.design.elements.find((el) => el.id === action.id)
      if (!source) return state

      const stateWithHistory = pushHistory(state)
      const cloned: HeroElement = {
        ...structuredClone(source),
        id: crypto.randomUUID(),
        label: `${source.label} (copy)`,
        desktop: {
          ...structuredClone(source.desktop),
          x: source.desktop.x + 2,
          y: source.desktop.y + 2,
        },
        mobile: {
          ...structuredClone(source.mobile),
          x: source.mobile.x + 2,
          y: source.mobile.y + 2,
        },
        mobileProps: source.mobileProps ? structuredClone(source.mobileProps) : undefined,
      }

      return {
        ...stateWithHistory,
        design: {
          ...stateWithHistory.design,
          elements: [...stateWithHistory.design.elements, cloned],
        },
        selectedElementId: cloned.id,
      }
    }

    case 'SELECT_ELEMENT': {
      return { ...state, selectedElementId: action.id }
    }

    case 'UPDATE_ELEMENT_LAYOUT': {
      const stateWithHistory = pushHistory(state)
      return {
        ...stateWithHistory,
        design: updateElement(
          stateWithHistory.design,
          action.id,
          (el) => ({
            ...el,
            [action.breakpoint]: { ...el[action.breakpoint], ...action.layout },
          }),
        ),
      }
    }

    case 'UPDATE_ELEMENT_PROPS': {
      const stateWithHistory = pushHistory(state)
      const targetField = action.breakpoint === 'mobile' ? 'mobileProps' : 'props'
      return {
        ...stateWithHistory,
        design: updateElement(
          stateWithHistory.design,
          action.id,
          (el) => {
            const currentProps = targetField === 'mobileProps'
              ? (el.mobileProps ?? el.props)
              : el.props
            return {
              ...el,
              [targetField]: { ...currentProps, ...action.props } as ElementProps,
            }
          },
        ),
      }
    }

    case 'UPDATE_ELEMENT_ANIMATION': {
      const stateWithHistory = pushHistory(state)
      return {
        ...stateWithHistory,
        design: updateElement(
          stateWithHistory.design,
          action.id,
          (el) => ({
            ...el,
            animation: { ...el.animation, ...action.animation },
          }),
        ),
      }
    }

    case 'UPDATE_ELEMENT_META': {
      const stateWithHistory = pushHistory(state)
      return {
        ...stateWithHistory,
        design: updateElement(
          stateWithHistory.design,
          action.id,
          (el) => ({ ...el, ...action.meta }),
        ),
      }
    }

    case 'REORDER_ELEMENTS': {
      const stateWithHistory = pushHistory(state)
      const elementMap = new Map(
        stateWithHistory.design.elements.map((el) => [el.id, el]),
      )
      const reordered = action.orderedIds
        .map((id) => elementMap.get(id))
        .filter((el): el is HeroElement => el !== undefined)
      return {
        ...stateWithHistory,
        design: { ...stateWithHistory.design, elements: reordered },
      }
    }

    case 'SET_BREAKPOINT': {
      return { ...state, activeBreakpoint: action.breakpoint }
    }

    case 'SET_ZOOM': {
      return { ...state, zoom: Math.min(2, Math.max(0.25, action.zoom)) }
    }

    case 'TOGGLE_GRID': {
      return { ...state, showGrid: !state.showGrid }
    }

    case 'UPDATE_CANVAS': {
      const stateWithHistory = pushHistory(state)
      const design = { ...stateWithHistory.design }

      if (action.updates.backgroundColor !== undefined) {
        design.backgroundColor = action.updates.backgroundColor
      }
      if (action.updates.backgroundImage !== undefined) {
        design.backgroundImage = action.updates.backgroundImage
      }
      if (action.updates.desktopHeight !== undefined) {
        design.canvas = {
          ...design.canvas,
          desktop: { ...design.canvas.desktop, height: action.updates.desktopHeight },
        }
      }
      if (action.updates.mobileHeight !== undefined) {
        design.canvas = {
          ...design.canvas,
          mobile: { ...design.canvas.mobile, height: action.updates.mobileHeight },
        }
      }
      if (action.updates.layoutMode !== undefined) {
        design.layoutMode = action.updates.layoutMode
      }

      return { ...stateWithHistory, design }
    }

    case 'ADD_ROW_WITH_COLUMNS': {
      const stateWithHistory = pushHistory(state)
      const row = createRowElement()
      const columns: HeroElement[] = []
      for (let i = 0; i < action.columnCount; i++) {
        columns.push(
          createColumnElement({
            label: `Column ${i + 1}`,
            props: { flex: 1 },
          }),
        )
      }
      // Set parentId on columns
      const columnsWithParent = columns.map((col) => ({
        ...col,
        parentId: row.id,
      }))
      return {
        ...stateWithHistory,
        design: {
          ...stateWithHistory.design,
          elements: [...stateWithHistory.design.elements, row, ...columnsWithParent],
        },
        selectedElementId: row.id,
      }
    }

    case 'MOVE_ELEMENT_TO_PARENT': {
      const stateWithHistory = pushHistory(state)
      return {
        ...stateWithHistory,
        design: updateElement(
          stateWithHistory.design,
          action.id,
          (el) => ({ ...el, parentId: action.parentId }),
        ),
      }
    }

    case 'UNDO': {
      if (state.historyIndex <= 0) return state
      const newIndex = state.historyIndex - 1
      return {
        ...state,
        design: structuredClone(state.history[newIndex]),
        historyIndex: newIndex,
      }
    }

    case 'REDO': {
      if (state.historyIndex >= state.history.length - 1) return state
      const newIndex = state.historyIndex + 1
      return {
        ...state,
        design: structuredClone(state.history[newIndex]),
        historyIndex: newIndex,
      }
    }

    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

function createInitialState(initialDesign?: HeroDesign): DesignerState {
  const raw = initialDesign ? structuredClone(initialDesign) : createBlankDesign()
  const design = migrateDesign(raw)
  return {
    design,
    selectedElementId: null,
    activeBreakpoint: 'desktop',
    zoom: 1,
    showGrid: true,
    history: [structuredClone(design)],
    historyIndex: 0,
  }
}

export function useHeroDesigner(initialDesign?: HeroDesign) {
  const [state, dispatch] = useReducer(
    designerReducer,
    initialDesign,
    createInitialState,
  )

  const canUndo = state.historyIndex > 0
  const canRedo = state.historyIndex < state.history.length - 1

  const selectedElement =
    state.design.elements.find((el) => el.id === state.selectedElementId) ??
    null

  const addElement = useCallback(
    (type: HeroElementType) => dispatch({ type: 'ADD_ELEMENT', elementType: type }),
    [],
  )

  const removeElement = useCallback(
    (id: string) => dispatch({ type: 'REMOVE_ELEMENT', id }),
    [],
  )

  const selectElement = useCallback(
    (id: string | null) => dispatch({ type: 'SELECT_ELEMENT', id }),
    [],
  )

  const undo = useCallback(() => dispatch({ type: 'UNDO' }), [])

  const redo = useCallback(() => dispatch({ type: 'REDO' }), [])

  return {
    state,
    dispatch,
    canUndo,
    canRedo,
    selectedElement,
    addElement,
    removeElement,
    selectElement,
    undo,
    redo,
  }
}
