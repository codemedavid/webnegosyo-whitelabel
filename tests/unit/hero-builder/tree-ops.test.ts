import { LIMITS } from '@/lib/hero-builder/constants'
import {
  countWidgets,
  duplicateNode,
  findNode,
  insertSection,
  insertWidget,
  insertionPointFor,
  moveNodeBy,
  moveSection,
  moveWidget,
  removeNode,
  resetDeviceOverrides,
  setAnimation,
  setColumnLayout,
  updateContent,
  updateStyle,
  updateTheme,
} from '@/lib/hero-builder/tree-ops'
import type { Column, HeroDesignV5, Widget } from '@/lib/hero-builder/types'

import { column, deepFreeze, designOf, section, spacer } from './helpers'

/**
 * s1: c1 [w1, w2, w3], c2 [w4], c3 []
 * s2: c4 [w5]
 */
function fixture(): HeroDesignV5 {
  const buttons: Widget = {
    id: 'w2',
    kind: 'buttons',
    content: { kind: 'buttons', items: [{ id: 'b1', label: 'Go', href: '#x', newTab: false, variant: 'solid' }] },
    style: { fontSize: 16 },
  }
  return deepFreeze(
    designOf([
      section('s1', [
        column('c1', [spacer('w1'), buttons, spacer('w3')], { width: 34 }),
        column('c2', [spacer('w4')], { width: 33 }),
        column('c3', [], { width: 33 }),
      ]),
      section('s2', [column('c4', [spacer('w5', { style: { size: 10 }, tablet: { size: 5 } })])]),
    ]),
  )
}

const widgetIds = (d: HeroDesignV5, columnId: string) =>
  (findNode(d, columnId)?.node as Column).widgets.map((w) => w.id)

function allIds(d: HeroDesignV5): string[] {
  const ids: string[] = []
  for (const s of d.sections) {
    ids.push(s.id)
    for (const c of s.columns) {
      ids.push(c.id)
      for (const w of c.widgets) {
        ids.push(w.id)
        if (w.content.kind === 'buttons') ids.push(...w.content.items.map((i) => i.id))
      }
    }
  }
  return ids
}

describe('findNode / countWidgets', () => {
  it('locates sections, columns and widgets with their parents', () => {
    const d = fixture()

    expect(findNode(d, 's2')).toMatchObject({ kind: 'section', index: 1, parentId: null })
    expect(findNode(d, 'c2')).toMatchObject({ kind: 'column', index: 1, parentId: 's1', sectionId: 's1' })
    expect(findNode(d, 'w3')).toMatchObject({ kind: 'widget', index: 2, parentId: 'c1', columnId: 'c1' })
    expect(findNode(d, 'nope')).toBeNull()
    expect(findNode(d, null)).toBeNull()
  })

  it('counts every widget', () => {
    expect(countWidgets(fixture())).toBe(5)
  })
})

describe('insert', () => {
  it('inserts a section at an index without mutating the input', () => {
    // Arrange
    const d = fixture()
    const before = structuredClone(d)

    // Act
    const next = insertSection(d, section('s9', [column('c9')]), 1)

    // Assert
    expect(next.sections.map((s) => s.id)).toEqual(['s1', 's9', 's2'])
    expect(d).toEqual(before)
  })

  it('clamps the section index into range', () => {
    expect(insertSection(fixture(), section('s9', [column('c9')]), 99).sections.map((s) => s.id)).toEqual(['s1', 's2', 's9'])
    expect(insertSection(fixture(), section('s9', [column('c9')]), -5).sections[0].id).toBe('s9')
  })

  it('refuses a section past LIMITS.sections', () => {
    const full = deepFreeze(designOf(Array.from({ length: LIMITS.sections }, (_, i) => section(`s${i}`, [column(`c${i}`)]))))

    expect(insertSection(full, section('extra', [column('cx')]))).toBe(full)
  })

  it('inserts a widget at an index or at the end', () => {
    const d = fixture()

    expect(widgetIds(insertWidget(d, 'c1', spacer('wn'), 1), 'c1')).toEqual(['w1', 'wn', 'w2', 'w3'])
    expect(widgetIds(insertWidget(d, 'c1', spacer('wn')), 'c1')).toEqual(['w1', 'w2', 'w3', 'wn'])
    expect(widgetIds(insertWidget(d, 'c3', spacer('wn')), 'c3')).toEqual(['wn'])
  })

  it('leaves untouched sections referentially equal', () => {
    const d = fixture()

    const next = insertWidget(d, 'c1', spacer('wn'))

    expect(next.sections[1]).toBe(d.sections[1])
    expect(next.sections[0]).not.toBe(d.sections[0])
  })

  it('refuses a widget past LIMITS.widgetsTotal', () => {
    const widgets = Array.from({ length: LIMITS.widgetsTotal }, (_, i) => spacer(`w${i}`))
    const full = deepFreeze(designOf([section('s1', [column('c1', widgets)])]))

    expect(insertWidget(full, 'c1', spacer('extra'))).toBe(full)
  })
})

describe('removeNode', () => {
  it('removes a widget', () => {
    expect(widgetIds(removeNode(fixture(), 'w2'), 'c1')).toEqual(['w1', 'w3'])
  })

  it('removes a column but never the last column of a section', () => {
    const d = fixture()

    expect(removeNode(d, 'c2').sections[0].columns.map((c) => c.id)).toEqual(['c1', 'c3'])
    expect(removeNode(d, 'c4')).toBe(d)
  })

  it('removes a section', () => {
    expect(removeNode(fixture(), 's1').sections.map((s) => s.id)).toEqual(['s2'])
  })

  it('returns the same design for an unknown id', () => {
    const d = fixture()
    expect(removeNode(d, 'nope')).toBe(d)
  })
})

describe('duplicateNode', () => {
  it('duplicates a widget right after itself with fresh ids (incl. nested button ids)', () => {
    // Arrange
    const d = fixture()

    // Act
    const { design, newId } = duplicateNode(d, 'w2')

    // Assert
    const ids = widgetIds(design, 'c1')
    expect(ids).toHaveLength(4)
    expect(ids[1]).toBe('w2')
    expect(ids[2]).toBe(newId)
    expect(newId).not.toBe('w2')
    const copy = findNode(design, newId)!.node as Widget
    expect(copy.content.kind === 'buttons' && copy.content.items[0].id).not.toBe('b1')
    expect(new Set(allIds(design)).size).toBe(allIds(design).length)
  })

  it('duplicates a section with fresh ids everywhere', () => {
    const d = fixture()

    const { design, newId } = duplicateNode(d, 's1')

    expect(design.sections.map((s) => s.id)).toEqual(['s1', newId, 's2'])
    expect(new Set(allIds(design)).size).toBe(allIds(design).length)
    expect(design.sections[1].columns.map((c) => c.widgets.length)).toEqual([3, 1, 0])
  })

  it('duplicates a column after itself', () => {
    const { design, newId } = duplicateNode(fixture(), 'c2')

    expect(design.sections[0].columns.map((c) => c.id)).toEqual(['c1', 'c2', newId, 'c3'])
    expect(new Set(allIds(design)).size).toBe(allIds(design).length)
  })

  it('refuses to duplicate a column past LIMITS.columnsPerSection', () => {
    const cols = Array.from({ length: LIMITS.columnsPerSection }, (_, i) => column(`c${i}`))
    const d = deepFreeze(designOf([section('s1', cols)]))

    expect(duplicateNode(d, 'c0')).toEqual({ design: d, newId: null })
  })

  it('returns null for an unknown id', () => {
    const d = fixture()
    expect(duplicateNode(d, 'nope')).toEqual({ design: d, newId: null })
  })
})

describe('moveNodeBy / moveSection', () => {
  it('moves a widget up and down among its siblings', () => {
    const d = fixture()

    expect(widgetIds(moveNodeBy(d, 'w2', -1), 'c1')).toEqual(['w2', 'w1', 'w3'])
    expect(widgetIds(moveNodeBy(d, 'w2', 1), 'c1')).toEqual(['w1', 'w3', 'w2'])
  })

  it('is a no-op at the edges', () => {
    const d = fixture()

    expect(moveNodeBy(d, 'w1', -1)).toEqual(d)
    expect(moveNodeBy(d, 'w3', 1)).toEqual(d)
    expect(moveNodeBy(d, 's1', -1)).toBe(d)
    expect(moveNodeBy(d, 'c3', 1)).toEqual(d)
  })

  it('moves columns and sections', () => {
    const d = fixture()

    expect(moveNodeBy(d, 'c1', 1).sections[0].columns.map((c) => c.id)).toEqual(['c2', 'c1', 'c3'])
    expect(moveNodeBy(d, 's2', -1).sections.map((s) => s.id)).toEqual(['s2', 's1'])
    expect(moveSection(d, 's1', 1).sections.map((s) => s.id)).toEqual(['s2', 's1'])
  })
})

describe('moveWidget', () => {
  it('moves a widget within its column using "insert before" indices', () => {
    const d = fixture()

    expect(widgetIds(moveWidget(d, 'w1', 'c1', 3), 'c1')).toEqual(['w2', 'w3', 'w1'])
    expect(widgetIds(moveWidget(d, 'w3', 'c1', 0), 'c1')).toEqual(['w3', 'w1', 'w2'])
  })

  it('moves a widget across columns and sections', () => {
    // Arrange
    const d = fixture()

    // Act
    const acrossColumns = moveWidget(d, 'w2', 'c2', 0)
    const acrossSections = moveWidget(d, 'w1', 'c4', 1)
    const intoEmpty = moveWidget(d, 'w4', 'c3', 0)

    // Assert
    expect(widgetIds(acrossColumns, 'c1')).toEqual(['w1', 'w3'])
    expect(widgetIds(acrossColumns, 'c2')).toEqual(['w2', 'w4'])
    expect(widgetIds(acrossSections, 'c4')).toEqual(['w5', 'w1'])
    expect(widgetIds(intoEmpty, 'c2')).toEqual([])
    expect(widgetIds(intoEmpty, 'c3')).toEqual(['w4'])
    expect(countWidgets(acrossSections)).toBe(5)
  })

  it('refuses non-widget sources and non-column targets', () => {
    const d = fixture()

    expect(moveWidget(d, 'c1', 'c2', 0)).toBe(d)
    expect(moveWidget(d, 'w1', 'w2', 0)).toBe(d)
    expect(moveWidget(d, 'w1', 'nope', 0)).toBe(d)
  })
})

describe('setColumnLayout', () => {
  it('merges widgets of dropped columns into the last kept column', () => {
    // Act
    const next = setColumnLayout(fixture(), 's1', [100])

    // Assert
    const cols = next.sections[0].columns
    expect(cols).toHaveLength(1)
    expect(cols[0].id).toBe('c1')
    expect(cols[0].style.width).toBe(100)
    expect(cols[0].widgets.map((w) => w.id)).toEqual(['w1', 'w2', 'w3', 'w4'])
  })

  it('keeps existing columns in order and adds new empty ones', () => {
    const next = setColumnLayout(fixture(), 's2', [25, 50, 25])

    const cols = next.sections[1].columns
    expect(cols.map((c) => c.style.width)).toEqual([25, 50, 25])
    expect(cols[0].id).toBe('c4')
    expect(cols[0].widgets.map((w) => w.id)).toEqual(['w5'])
    expect(cols[1].widgets).toEqual([])
    expect(new Set(cols.map((c) => c.id)).size).toBe(3)
  })

  it('refuses zero or too many columns', () => {
    const d = fixture()

    expect(setColumnLayout(d, 's1', [])).toBe(d)
    expect(setColumnLayout(d, 's1', Array(LIMITS.columnsPerSection + 1).fill(10))).toBe(d)
  })
})

describe('updateStyle', () => {
  it('merges into the desktop style', () => {
    const next = updateStyle(fixture(), 'w5', 'desktop', { color: '#fff' })

    expect(findNode(next, 'w5')!.node.style).toEqual({ size: 10, color: '#fff' })
  })

  it('writes to the device layer without touching desktop', () => {
    const next = updateStyle(fixture(), 'w5', 'mobile', { size: 2 })

    const node = findNode(next, 'w5')!.node
    expect(node.style).toEqual({ size: 10 })
    expect(node.tablet).toEqual({ size: 5 })
    expect(node.mobile).toEqual({ size: 2 })
  })

  it('removes keys patched with undefined', () => {
    const next = updateStyle(fixture(), 'w5', 'desktop', { size: undefined })

    expect(findNode(next, 'w5')!.node.style).toEqual({})
  })

  it('drops an emptied tablet layer entirely (inherit again)', () => {
    const next = updateStyle(fixture(), 'w5', 'tablet', { size: undefined })

    const node = findNode(next, 'w5')!.node
    expect(node).not.toHaveProperty('tablet')
    expect(node.style).toEqual({ size: 10 })
  })

  it('works on sections and columns too', () => {
    const d = fixture()

    expect(findNode(updateStyle(d, 's1', 'tablet', { gap: 4 }), 's1')!.node.tablet).toEqual({ gap: 4 })
    expect(findNode(updateStyle(d, 'c2', 'desktop', { gap: 4 }), 'c2')!.node.style).toEqual({ width: 33, gap: 4 })
  })

  it('returns the same design for an unknown id', () => {
    const d = fixture()
    expect(updateStyle(d, 'nope', 'desktop', { size: 1 })).toBe(d)
  })

  it('resetDeviceOverrides drops the whole device layer', () => {
    expect(findNode(resetDeviceOverrides(fixture(), 'w5', 'tablet'), 'w5')!.node).not.toHaveProperty('tablet')
  })
})

describe('updateContent / setAnimation / updateTheme', () => {
  it('patches content but never changes the content kind', () => {
    const next = updateContent(fixture(), 'w2', { kind: 'text', text: 'x' } as never)

    const w = findNode(next, 'w2')!.node as Widget
    expect(w.content.kind).toBe('buttons')
  })

  it('sets and clears an animation', () => {
    const d = fixture()
    const withAnim = setAnimation(d, 'w1', { type: 'fade', duration: 500, delay: 0 })

    expect((findNode(withAnim, 'w1')!.node as Widget).animation).toEqual({ type: 'fade', duration: 500, delay: 0 })
    expect(findNode(setAnimation(withAnim, 'w1', { type: 'none', duration: 0, delay: 0 }), 'w1')!.node).not.toHaveProperty('animation')
  })

  it('merges theme colors', () => {
    const d = deepFreeze(designOf([], { colors: { primary: '#000' } }))

    const next = updateTheme(d, { colors: { accent: '#fff' }, buttonRadius: 4 })

    expect(next.theme.colors).toEqual({ primary: '#000', accent: '#fff' })
    expect(next.theme.buttonRadius).toBe(4)
  })
})

describe('insertionPointFor', () => {
  it('inserts after a selected widget', () => {
    expect(insertionPointFor(fixture(), 'w2')).toEqual({ columnId: 'c1', index: 2 })
  })

  it('appends to a selected column', () => {
    expect(insertionPointFor(fixture(), 'c2')).toEqual({ columnId: 'c2', index: 1 })
  })

  it('appends to the first column of a selected section', () => {
    expect(insertionPointFor(fixture(), 's1')).toEqual({ columnId: 'c1', index: 3 })
  })

  it('falls back to the first column of the last section', () => {
    expect(insertionPointFor(fixture(), null)).toEqual({ columnId: 'c4', index: 1 })
    expect(insertionPointFor(fixture(), 'nope')).toEqual({ columnId: 'c4', index: 1 })
  })

  it('returns null for an empty design', () => {
    expect(insertionPointFor(designOf([]), null)).toBeNull()
  })
})

describe('immutability', () => {
  it('never mutates the (deep-frozen) input across every operation', () => {
    // Arrange
    const d = fixture()
    const snapshot = structuredClone(d)

    // Act
    const run = () => {
      insertSection(d, section('s9', [column('c9')]))
      insertWidget(d, 'c1', spacer('wn'), 0)
      removeNode(d, 'w1')
      removeNode(d, 'c2')
      removeNode(d, 's2')
      duplicateNode(d, 's1')
      duplicateNode(d, 'c1')
      duplicateNode(d, 'w2')
      moveNodeBy(d, 'w1', 1)
      moveNodeBy(d, 'c1', 1)
      moveNodeBy(d, 's1', 1)
      moveSection(d, 's2', 0)
      moveWidget(d, 'w1', 'c1', 3)
      moveWidget(d, 'w1', 'c4', 0)
      setColumnLayout(d, 's1', [100])
      setColumnLayout(d, 's2', [50, 50])
      updateStyle(d, 'w5', 'tablet', { size: undefined })
      updateStyle(d, 'w5', 'desktop', { size: 1 })
      resetDeviceOverrides(d, 'w5', 'tablet')
      updateContent(d, 'w2', { items: [] })
      setAnimation(d, 'w1', { type: 'zoom', duration: 300, delay: 0 })
      updateTheme(d, { colors: { primary: '#fff' } })
      insertionPointFor(d, 'w1')
    }

    // Assert
    expect(run).not.toThrow()
    expect(d).toEqual(snapshot)
  })
})
