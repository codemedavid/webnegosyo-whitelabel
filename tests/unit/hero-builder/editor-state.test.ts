import { createBlankDesign, createSection } from '@/lib/hero-builder/defaults'
import { editorReducer, initialEditorState } from '@/lib/hero-builder/editor-state'
import { insertSection } from '@/lib/hero-builder/tree-ops'

describe('editorReducer', () => {
  const blank = createBlankDesign()
  const withSection = insertSection(blank, createSection([100], 'Hero'))

  it('pushes the previous design onto history on edit and clears redo', () => {
    // Arrange
    const state = initialEditorState(blank)

    // Act
    const next = editorReducer(state, { type: 'edit', design: withSection, now: 1000 })

    // Assert
    expect(next.design).toBe(withSection)
    expect(next.past).toEqual([blank])
    expect(next.future).toEqual([])
  })

  it('undo and redo walk the history', () => {
    const edited = editorReducer(initialEditorState(blank), { type: 'edit', design: withSection, now: 1000 })

    const undone = editorReducer(edited, { type: 'undo' })
    expect(undone.design).toBe(blank)
    expect(undone.future).toEqual([withSection])

    const redone = editorReducer(undone, { type: 'redo' })
    expect(redone.design).toBe(withSection)
    expect(redone.past).toEqual([blank])
  })

  it('merges rapid edits with the same coalesce key into one undo step', () => {
    const a = insertSection(blank, createSection([100], 'A'))
    const b = insertSection(a, createSection([100], 'B'))
    let state = initialEditorState(blank)

    state = editorReducer(state, { type: 'edit', design: a, coalesceKey: 'size', now: 1000 })
    state = editorReducer(state, { type: 'edit', design: b, coalesceKey: 'size', now: 1400 })

    expect(state.design).toBe(b)
    expect(state.past).toEqual([blank])
  })

  it('does not merge edits when the key differs or too much time passed', () => {
    const a = insertSection(blank, createSection([100], 'A'))
    const b = insertSection(a, createSection([100], 'B'))
    const c = insertSection(b, createSection([100], 'C'))
    let state = initialEditorState(blank)

    state = editorReducer(state, { type: 'edit', design: a, coalesceKey: 'size', now: 1000 })
    state = editorReducer(state, { type: 'edit', design: b, coalesceKey: 'color', now: 1100 })
    state = editorReducer(state, { type: 'edit', design: c, coalesceKey: 'color', now: 5000 })

    expect(state.past).toEqual([blank, a, b])
  })

  it('ignores an edit that returns the same design object', () => {
    const state = initialEditorState(blank)
    expect(editorReducer(state, { type: 'edit', design: blank, now: 1 })).toBe(state)
  })

  it('clears a selection whose node no longer exists after undo', () => {
    const section = createSection([100], 'Hero')
    const design = insertSection(blank, section)
    let state = editorReducer(initialEditorState(blank), { type: 'edit', design, select: section.id, now: 1 })
    expect(state.selectedId).toBe(section.id)

    state = editorReducer(state, { type: 'undo' })
    expect(state.selectedId).toBeNull()
  })

  it('caps history depth', () => {
    let state = initialEditorState(blank)
    let design = blank
    for (let i = 0; i < 120; i++) {
      design = { ...design }
      state = editorReducer(state, { type: 'edit', design, now: i * 10_000 })
    }
    expect(state.past.length).toBeLessThanOrEqual(80)
  })

  it('switches device and selection without touching history', () => {
    const state = initialEditorState(blank)
    const next = editorReducer(editorReducer(state, { type: 'device', device: 'mobile' }), { type: 'select', id: null })
    expect(next.device).toBe('mobile')
    expect(next.past).toEqual([])
  })
})

describe('editorReducer replace', () => {
  it('replaces the design as one undoable step and clears the selection', () => {
    const blank = createBlankDesign()
    const template = insertSection(blank, createSection([50, 50], 'Template'))
    const state = { ...initialEditorState(blank), selectedId: 'gone' }

    const replaced = editorReducer(state, { type: 'replace', design: template })
    expect(replaced.design).toBe(template)
    expect(replaced.selectedId).toBeNull()

    expect(editorReducer(replaced, { type: 'undo' }).design).toBe(blank)
  })
})
