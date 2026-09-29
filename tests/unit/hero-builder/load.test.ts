import { LIMITS } from '@/lib/hero-builder/constants'
import { loadHeroDesign, parseStoredDesign, storedDesignVersion } from '@/lib/hero-builder/load'

import { column, designOf, section, spacer } from './helpers'

describe('parseStoredDesign / storedDesignVersion', () => {
  it('parses a JSON string (the TEXT column) and passes objects through', () => {
    const obj = { version: 5 }

    expect(parseStoredDesign(JSON.stringify(obj))).toEqual(obj)
    expect(parseStoredDesign(obj)).toBe(obj)
  })

  it.each([null, undefined, '', 'not json', '[1,2]', '"str"', '42', 7, []])('returns null for %p', (raw) => {
    expect(parseStoredDesign(raw)).toBeNull()
  })

  it('returns null for strings past the size cap without parsing them', () => {
    const huge = JSON.stringify({ version: 5, sections: [], pad: 'x'.repeat(LIMITS.designBytes * 2) })

    expect(parseStoredDesign(huge)).toBeNull()
  })

  it('reads the stored version', () => {
    expect(storedDesignVersion('{"version":3}')).toBe(3)
    expect(storedDesignVersion('{"version":"5"}')).toBeNull()
    expect(storedDesignVersion('garbage')).toBeNull()
  })
})

describe('loadHeroDesign', () => {
  it('loads a v5 JSON string', () => {
    // Arrange
    const design = designOf([section('s1', [column('c1', [spacer('w1')])])], { headingFont: 'inter' })

    // Act
    const loaded = loadHeroDesign(JSON.stringify(design))

    // Assert
    expect(loaded).toEqual(design)
  })

  it('converts v4 designs on the fly', () => {
    const v4 = {
      version: 4,
      globalStyles: { backgroundColor: '#fff', maxWidth: 1200 },
      sections: [{
        id: 's', label: 'Hero',
        settings: { contentWidth: 0, horizontalAlign: 'center', minHeight: 0, background: { type: 'color', color: '#000' }, padding: { top: 0, right: 0, bottom: 0, left: 0 }, margin: { top: 0, bottom: 0 } },
        columns: [{ id: 'c', width: 100, widgets: [], settings: { verticalAlign: 'top', horizontalAlign: 'left', padding: { top: 0, right: 0, bottom: 0, left: 0 }, background: { type: 'none' }, borderRadius: 0 } }],
      }],
    }

    const loaded = loadHeroDesign(JSON.stringify(v4))

    expect(loaded?.version).toBe(5)
    expect(loaded?.sections).toHaveLength(1)
  })

  it.each([
    ['garbage', 'not json at all'],
    ['v3 design', JSON.stringify({ version: 3, elements: [] })],
    ['v5 without sections', JSON.stringify({ version: 5 })],
    ['v5 with non-array sections', JSON.stringify({ version: 5, sections: {} })],
    ['huge string', 'x'.repeat(LIMITS.designBytes * 2 + 1)],
    ['null', null],
  ])('returns null for %s', (_label, raw) => {
    expect(loadHeroDesign(raw)).toBeNull()
  })

  it('drops nodes with bad ids or unknown kinds, keeping the rest', () => {
    // Arrange
    const raw = {
      version: 5,
      theme: { colors: { primary: '#f00' }, headingFont: 7, bodyFont: 'inter', buttonRadius: 'x' },
      sections: [
        {
          id: 's1',
          label: 'Keep',
          style: {},
          columns: [
            {
              id: 'c1',
              style: {},
              widgets: [
                { id: 'w1', kind: 'spacer', content: { kind: 'spacer' }, style: {} },
                { id: 'bad id!', kind: 'spacer', content: { kind: 'spacer' }, style: {} },
                { id: 'w3', kind: 'script', content: { kind: 'script' }, style: {} },
                { id: 'w4', kind: 'heading', content: { kind: 'text', text: 'x' }, style: {} },
                { id: 'w5', kind: 'text', style: {} },
                { id: 'w6', kind: 'text', content: { kind: 'text', text: 'ok' }, style: 'nope', tablet: [1], mobile: { size: 1 } },
                'not an object',
              ],
            },
            { id: '<c2>', style: {}, widgets: [] },
          ],
        },
        { id: 's2', label: 'No valid columns', style: {}, columns: [{ id: '' }] },
        { id: '../s3', label: 'Bad id', style: {}, columns: [{ id: 'c3', widgets: [] }] },
        { id: 's4', label: 'No columns array', style: {} },
      ],
    }

    // Act
    const loaded = loadHeroDesign(JSON.stringify(raw))

    // Assert
    expect(loaded).not.toBeNull()
    expect(loaded!.sections.map((s) => s.id)).toEqual(['s1'])
    expect(loaded!.sections[0].columns.map((c) => c.id)).toEqual(['c1'])
    const widgets = loaded!.sections[0].columns[0].widgets
    expect(widgets.map((w) => w.id)).toEqual(['w1', 'w6'])
    expect(widgets[1].style).toEqual({})
    expect(widgets[1]).not.toHaveProperty('tablet')
    expect(widgets[1].mobile).toEqual({ size: 1 })
    expect(loaded!.theme).toEqual({ colors: { primary: '#f00' }, headingFont: '', bodyFont: 'inter', buttonRadius: 10 })
  })

  it('caps sections at LIMITS.sections and columns at LIMITS.columnsPerSection', () => {
    const cols = Array.from({ length: LIMITS.columnsPerSection + 3 }, (_, i) => column(`c${i}`))
    const sections = Array.from({ length: LIMITS.sections + 5 }, (_, i) => section(`s${i}`, i === 0 ? cols : [column(`x${i}`)]))

    const loaded = loadHeroDesign(designOf(sections))

    expect(loaded!.sections).toHaveLength(LIMITS.sections)
    expect(loaded!.sections[0].columns).toHaveLength(LIMITS.columnsPerSection)
  })

  it('falls back to the default theme when theme is missing', () => {
    const loaded = loadHeroDesign({ version: 5, sections: [] })

    expect(loaded).toEqual({ version: 5, theme: { colors: {}, headingFont: '', bodyFont: '', buttonRadius: 10 }, sections: [] })
  })
})

describe('loadHeroDesign never throws on malformed v4 data', () => {
  it.each([
    { version: 4, sections: [{ columns: [{ widgets: [null] }] }] },
    { version: 4, sections: [{ columns: [{ widgets: [{ id: 'w', type: 'text' }] }] }] },
    { version: 4, sections: [null, 5, 'x'] },
    { version: 4, sections: 'nope' },
    { version: 4, sections: [{ columns: [null, { widgets: 'x' }] }] },
  ])('returns null or a design for %j', (raw) => {
    expect(() => loadHeroDesign(JSON.stringify(raw))).not.toThrow()
  })
})
