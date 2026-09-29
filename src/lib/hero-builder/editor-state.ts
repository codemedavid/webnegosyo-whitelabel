// ---------------------------------------------------------------------------
// Editor state: the design, selection, device and undo history. Pure reducer
// so it is testable without React; history holds whole design snapshots,
// which is cheap because every edit is structurally shared (tree-ops.ts).
// ---------------------------------------------------------------------------

import { LIMITS } from './constants'
import { findNode } from './tree-ops'
import type { Device, HeroDesignV5 } from './types'

/** Edits with the same key inside this window become one undo step (slider drags, typing). */
const COALESCE_WINDOW_MS = 1200

export interface EditorState {
  design: HeroDesignV5
  selectedId: string | null
  device: Device
  past: HeroDesignV5[]
  future: HeroDesignV5[]
  lastEdit: { key: string; at: number } | null
}

export type EditorAction =
  | { type: 'edit'; design: HeroDesignV5; select?: string | null; coalesceKey?: string; now: number }
  /** Like edit, but derives the design from the CURRENT state (safe for back-to-back events). */
  | { type: 'apply'; update: (design: HeroDesignV5) => HeroDesignV5; select?: string | null; coalesceKey?: string; now: number }
  | { type: 'select'; id: string | null }
  | { type: 'device'; device: Device }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'replace'; design: HeroDesignV5 }

export function initialEditorState(design: HeroDesignV5): EditorState {
  return { design, selectedId: null, device: 'desktop', past: [], future: [], lastEdit: null }
}

function keepSelection(design: HeroDesignV5, id: string | null): string | null {
  return id && findNode(design, id) ? id : null
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'apply':
      return editorReducer(state, {
        type: 'edit',
        design: action.update(state.design),
        select: action.select,
        coalesceKey: action.coalesceKey,
        now: action.now,
      })
    case 'edit': {
      if (action.design === state.design) {
        return action.select === undefined ? state : { ...state, selectedId: action.select }
      }
      const key = action.coalesceKey
      const merges =
        !!key && state.lastEdit?.key === key && action.now - state.lastEdit.at < COALESCE_WINDOW_MS && state.past.length > 0
      const past = merges ? state.past : [...state.past, state.design].slice(-LIMITS.historyDepth)
      return {
        ...state,
        design: action.design,
        past,
        future: [],
        selectedId: action.select === undefined ? keepSelection(action.design, state.selectedId) : action.select,
        lastEdit: key ? { key, at: action.now } : null,
      }
    }
    case 'undo': {
      const previous = state.past[state.past.length - 1]
      if (!previous) return state
      return {
        ...state,
        design: previous,
        past: state.past.slice(0, -1),
        future: [state.design, ...state.future],
        selectedId: keepSelection(previous, state.selectedId),
        lastEdit: null,
      }
    }
    case 'redo': {
      const [next, ...rest] = state.future
      if (!next) return state
      return {
        ...state,
        design: next,
        past: [...state.past, state.design],
        future: rest,
        selectedId: keepSelection(next, state.selectedId),
        lastEdit: null,
      }
    }
    case 'select':
      return state.selectedId === action.id ? state : { ...state, selectedId: action.id }
    case 'device':
      return state.device === action.device ? state : { ...state, device: action.device }
    case 'replace':
      // Templates / start over / draft restore: one undoable step.
      return editorReducer(state, { type: 'edit', design: action.design, select: null, now: 0 })
    default:
      return state
  }
}
