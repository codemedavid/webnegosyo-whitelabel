import { describe, it, expect } from '@jest/globals'
import { blockDesignerReducer } from '@/hooks/use-hero-block-designer'
import type { BlockDesignerAction } from '@/hooks/use-hero-block-designer'
import {
  createBlankBlockDesign,
  createSection,
  createColumn,
  createTextWidget,
  createButtonWidget,
  widgetFactories,
} from '@/lib/hero-block-defaults'
import type {
  BlockDesignerState,
  HeroBlockDesign,
  TextWidgetProps,
} from '@/types/hero-block-designer'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides?: Partial<BlockDesignerState>): BlockDesignerState {
  return {
    design: createBlankBlockDesign(),
    selection: null,
    history: [],
    historyIndex: -1,
    activeBreakpoint: 'desktop',
    ...overrides,
  }
}

/** Create a state with one section containing one column and one widget */
function makePopulatedState(): BlockDesignerState {
  const widget = createTextWidget()
  const column = createColumn(100)
  column.widgets = [widget]
  const section = createSection()
  section.columns = [column]
  const design: HeroBlockDesign = {
    version: 4,
    sections: [section],
    globalStyles: { backgroundColor: '#ffffff', maxWidth: 1200 },
  }
  return makeState({ design })
}

/** Create a state with two sections, each with one column, first column has a widget */
function makeTwoSectionState(): BlockDesignerState {
  const widget = createTextWidget()
  const col1 = createColumn(100)
  col1.widgets = [widget]
  const section1 = createSection()
  section1.columns = [col1]
  section1.label = 'First Section'

  const col2 = createColumn(100)
  const section2 = createSection()
  section2.columns = [col2]
  section2.label = 'Second Section'

  const design: HeroBlockDesign = {
    version: 4,
    sections: [section1, section2],
    globalStyles: { backgroundColor: '#ffffff', maxWidth: 1200 },
  }
  return makeState({ design })
}

// ---------------------------------------------------------------------------
// SET_DESIGN
// ---------------------------------------------------------------------------

describe('SET_DESIGN', () => {
  it('replaces the design and clears selection and history', () => {
    const initial = makePopulatedState()
    initial.selection = { type: 'section', sectionId: 'some-id' }
    initial.history = [createBlankBlockDesign()]
    initial.historyIndex = 0

    const newDesign = createBlankBlockDesign()
    newDesign.globalStyles.backgroundColor = '#000000'

    const result = blockDesignerReducer(initial, {
      type: 'SET_DESIGN',
      design: newDesign,
    })

    expect(result.design.globalStyles.backgroundColor).toBe('#000000')
    expect(result.selection).toBeNull()
    expect(result.history).toEqual([])
    expect(result.historyIndex).toBe(-1)
  })

  it('deep clones the design so mutations to the original do not affect state', () => {
    const initial = makeState()
    const newDesign = createBlankBlockDesign()

    const result = blockDesignerReducer(initial, {
      type: 'SET_DESIGN',
      design: newDesign,
    })

    newDesign.globalStyles.backgroundColor = '#FF0000'
    expect(result.design.globalStyles.backgroundColor).toBe('#ffffff')
  })
})

// ---------------------------------------------------------------------------
// ADD_SECTION
// ---------------------------------------------------------------------------

describe('ADD_SECTION', () => {
  it('adds a section at the end when no afterIndex', () => {
    const initial = makePopulatedState()
    const result = blockDesignerReducer(initial, {
      type: 'ADD_SECTION',
      columnWidths: [50, 50],
    })

    expect(result.design.sections).toHaveLength(2)
    const added = result.design.sections[1]
    expect(added.columns).toHaveLength(2)
    expect(added.columns[0].width).toBe(50)
    expect(added.columns[1].width).toBe(50)
  })

  it('inserts after the given afterIndex', () => {
    const initial = makeTwoSectionState()
    const result = blockDesignerReducer(initial, {
      type: 'ADD_SECTION',
      columnWidths: [100],
      afterIndex: 0,
    })

    expect(result.design.sections).toHaveLength(3)
    // original first section
    expect(result.design.sections[0].label).toBe('First Section')
    // new section inserted at index 1
    expect(result.design.sections[1].columns).toHaveLength(1)
    // original second section moved to index 2
    expect(result.design.sections[2].label).toBe('Second Section')
  })

  it('selects the new section', () => {
    const initial = makeState()
    const result = blockDesignerReducer(initial, {
      type: 'ADD_SECTION',
      columnWidths: [100],
    })

    expect(result.selection).not.toBeNull()
    expect(result.selection?.type).toBe('section')
    expect(result.selection?.sectionId).toBe(result.design.sections[0].id)
  })

  it('pushes history before adding', () => {
    const initial = makeState()
    const result = blockDesignerReducer(initial, {
      type: 'ADD_SECTION',
      columnWidths: [100],
    })

    expect(result.history).toHaveLength(1)
    expect(result.historyIndex).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// REMOVE_SECTION
// ---------------------------------------------------------------------------

describe('REMOVE_SECTION', () => {
  it('removes the section by id', () => {
    const initial = makeTwoSectionState()
    const sectionId = initial.design.sections[0].id

    const result = blockDesignerReducer(initial, {
      type: 'REMOVE_SECTION',
      sectionId,
    })

    expect(result.design.sections).toHaveLength(1)
    expect(result.design.sections[0].id).not.toBe(sectionId)
  })

  it('clears selection if the removed section was selected', () => {
    const initial = makeTwoSectionState()
    const sectionId = initial.design.sections[0].id
    initial.selection = { type: 'section', sectionId }

    const result = blockDesignerReducer(initial, {
      type: 'REMOVE_SECTION',
      sectionId,
    })

    expect(result.selection).toBeNull()
  })

  it('preserves selection if a different section was selected', () => {
    const initial = makeTwoSectionState()
    const sectionToRemove = initial.design.sections[0].id
    const otherSection = initial.design.sections[1].id
    initial.selection = { type: 'section', sectionId: otherSection }

    const result = blockDesignerReducer(initial, {
      type: 'REMOVE_SECTION',
      sectionId: sectionToRemove,
    })

    expect(result.selection?.sectionId).toBe(otherSection)
  })
})

// ---------------------------------------------------------------------------
// DUPLICATE_SECTION
// ---------------------------------------------------------------------------

describe('DUPLICATE_SECTION', () => {
  it('creates a clone with new IDs and inserts after original', () => {
    const initial = makePopulatedState()
    const originalId = initial.design.sections[0].id

    const result = blockDesignerReducer(initial, {
      type: 'DUPLICATE_SECTION',
      sectionId: originalId,
    })

    expect(result.design.sections).toHaveLength(2)
    const clone = result.design.sections[1]
    expect(clone.id).not.toBe(originalId)
    expect(clone.label).toContain('(copy)')
  })

  it('assigns new IDs to columns and widgets in the clone', () => {
    const initial = makePopulatedState()
    const originalSection = initial.design.sections[0]
    const originalColumnId = originalSection.columns[0].id
    const originalWidgetId = originalSection.columns[0].widgets[0].id

    const result = blockDesignerReducer(initial, {
      type: 'DUPLICATE_SECTION',
      sectionId: originalSection.id,
    })

    const clone = result.design.sections[1]
    expect(clone.columns[0].id).not.toBe(originalColumnId)
    expect(clone.columns[0].widgets[0].id).not.toBe(originalWidgetId)
  })

  it('preserves widgets in the cloned section', () => {
    const initial = makePopulatedState()
    const originalSection = initial.design.sections[0]

    const result = blockDesignerReducer(initial, {
      type: 'DUPLICATE_SECTION',
      sectionId: originalSection.id,
    })

    const clone = result.design.sections[1]
    expect(clone.columns[0].widgets).toHaveLength(1)
    expect(clone.columns[0].widgets[0].type).toBe('text')
  })

  it('selects the cloned section', () => {
    const initial = makePopulatedState()
    const result = blockDesignerReducer(initial, {
      type: 'DUPLICATE_SECTION',
      sectionId: initial.design.sections[0].id,
    })

    expect(result.selection?.type).toBe('section')
    expect(result.selection?.sectionId).toBe(result.design.sections[1].id)
  })

  it('returns state unchanged if sectionId not found', () => {
    const initial = makePopulatedState()
    const result = blockDesignerReducer(initial, {
      type: 'DUPLICATE_SECTION',
      sectionId: 'nonexistent',
    })

    expect(result).toBe(initial)
  })
})

// ---------------------------------------------------------------------------
// REORDER_SECTIONS
// ---------------------------------------------------------------------------

describe('REORDER_SECTIONS', () => {
  it('reorders sections by the provided ids', () => {
    const initial = makeTwoSectionState()
    const id1 = initial.design.sections[0].id
    const id2 = initial.design.sections[1].id

    const result = blockDesignerReducer(initial, {
      type: 'REORDER_SECTIONS',
      sectionIds: [id2, id1],
    })

    expect(result.design.sections[0].id).toBe(id2)
    expect(result.design.sections[1].id).toBe(id1)
  })
})

// ---------------------------------------------------------------------------
// UPDATE_SECTION_SETTINGS
// ---------------------------------------------------------------------------

describe('UPDATE_SECTION_SETTINGS', () => {
  it('merges into settings for desktop breakpoint', () => {
    const initial = makePopulatedState()
    const sectionId = initial.design.sections[0].id

    const result = blockDesignerReducer(initial, {
      type: 'UPDATE_SECTION_SETTINGS',
      sectionId,
      settings: { minHeight: 500 },
    })

    expect(result.design.sections[0].settings.minHeight).toBe(500)
    // other settings preserved
    expect(result.design.sections[0].settings.contentWidth).toBe(1200)
  })

  it('stores in responsiveOverrides for non-desktop breakpoint', () => {
    const initial = makePopulatedState()
    const sectionId = initial.design.sections[0].id

    const result = blockDesignerReducer(initial, {
      type: 'UPDATE_SECTION_SETTINGS',
      sectionId,
      settings: { minHeight: 200 },
      breakpoint: 'tablet',
    })

    expect(result.design.sections[0].responsiveOverrides?.tablet?.minHeight).toBe(200)
    // Desktop settings unchanged
    expect(result.design.sections[0].settings.minHeight).toBe(0)
  })

  it('merges with existing responsive overrides', () => {
    const initial = makePopulatedState()
    const sectionId = initial.design.sections[0].id

    // First update
    let result = blockDesignerReducer(initial, {
      type: 'UPDATE_SECTION_SETTINGS',
      sectionId,
      settings: { minHeight: 200 },
      breakpoint: 'mobile',
    })
    // Second update
    result = blockDesignerReducer(result, {
      type: 'UPDATE_SECTION_SETTINGS',
      sectionId,
      settings: { contentWidth: 600 },
      breakpoint: 'mobile',
    })

    expect(result.design.sections[0].responsiveOverrides?.mobile?.minHeight).toBe(200)
    expect(result.design.sections[0].responsiveOverrides?.mobile?.contentWidth).toBe(600)
  })
})

// ---------------------------------------------------------------------------
// RENAME_SECTION
// ---------------------------------------------------------------------------

describe('RENAME_SECTION', () => {
  it('updates the label of a section', () => {
    const initial = makePopulatedState()
    const sectionId = initial.design.sections[0].id

    const result = blockDesignerReducer(initial, {
      type: 'RENAME_SECTION',
      sectionId,
      label: 'Hero Banner',
    })

    expect(result.design.sections[0].label).toBe('Hero Banner')
  })

  it('pushes history', () => {
    const initial = makePopulatedState()
    const sectionId = initial.design.sections[0].id

    const result = blockDesignerReducer(initial, {
      type: 'RENAME_SECTION',
      sectionId,
      label: 'New Name',
    })

    expect(result.history).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// SET_COLUMN_LAYOUT
// ---------------------------------------------------------------------------

describe('SET_COLUMN_LAYOUT', () => {
  it('creates new columns with specified widths', () => {
    const initial = makePopulatedState()
    const sectionId = initial.design.sections[0].id

    const result = blockDesignerReducer(initial, {
      type: 'SET_COLUMN_LAYOUT',
      sectionId,
      widths: [50, 50],
    })

    expect(result.design.sections[0].columns).toHaveLength(2)
    expect(result.design.sections[0].columns[0].width).toBe(50)
    expect(result.design.sections[0].columns[1].width).toBe(50)
  })

  it('preserves all widgets in the first new column', () => {
    const initial = makePopulatedState()
    const sectionId = initial.design.sections[0].id
    const originalWidgetCount = initial.design.sections[0].columns[0].widgets.length

    const result = blockDesignerReducer(initial, {
      type: 'SET_COLUMN_LAYOUT',
      sectionId,
      widths: [33, 34, 33],
    })

    expect(result.design.sections[0].columns[0].widgets).toHaveLength(originalWidgetCount)
    expect(result.design.sections[0].columns[1].widgets).toHaveLength(0)
    expect(result.design.sections[0].columns[2].widgets).toHaveLength(0)
  })

  it('collects widgets from all columns into the first', () => {
    // Set up a section with two columns, each having a widget
    const widget1 = createTextWidget()
    const widget2 = createButtonWidget()
    const col1 = createColumn(50)
    col1.widgets = [widget1]
    const col2 = createColumn(50)
    col2.widgets = [widget2]
    const section = createSection()
    section.columns = [col1, col2]

    const design: HeroBlockDesign = {
      version: 4,
      sections: [section],
      globalStyles: { backgroundColor: '#ffffff', maxWidth: 1200 },
    }
    const initial = makeState({ design })

    const result = blockDesignerReducer(initial, {
      type: 'SET_COLUMN_LAYOUT',
      sectionId: section.id,
      widths: [100],
    })

    expect(result.design.sections[0].columns).toHaveLength(1)
    expect(result.design.sections[0].columns[0].widgets).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// UPDATE_COLUMN_SETTINGS
// ---------------------------------------------------------------------------

describe('UPDATE_COLUMN_SETTINGS', () => {
  it('merges into settings for desktop', () => {
    const initial = makePopulatedState()
    const sectionId = initial.design.sections[0].id
    const columnId = initial.design.sections[0].columns[0].id

    const result = blockDesignerReducer(initial, {
      type: 'UPDATE_COLUMN_SETTINGS',
      sectionId,
      columnId,
      settings: { verticalAlign: 'center' },
    })

    expect(result.design.sections[0].columns[0].settings.verticalAlign).toBe('center')
  })

  it('stores in responsiveOverrides for non-desktop', () => {
    const initial = makePopulatedState()
    const sectionId = initial.design.sections[0].id
    const columnId = initial.design.sections[0].columns[0].id

    const result = blockDesignerReducer(initial, {
      type: 'UPDATE_COLUMN_SETTINGS',
      sectionId,
      columnId,
      settings: { verticalAlign: 'bottom' },
      breakpoint: 'mobile',
    })

    expect(result.design.sections[0].columns[0].responsiveOverrides?.mobile?.verticalAlign).toBe('bottom')
    // Desktop unchanged
    expect(result.design.sections[0].columns[0].settings.verticalAlign).toBe('top')
  })
})

// ---------------------------------------------------------------------------
// ADD_WIDGET
// ---------------------------------------------------------------------------

describe('ADD_WIDGET', () => {
  it('adds a widget to the end of the column', () => {
    const initial = makePopulatedState()
    const sectionId = initial.design.sections[0].id
    const columnId = initial.design.sections[0].columns[0].id

    const result = blockDesignerReducer(initial, {
      type: 'ADD_WIDGET',
      sectionId,
      columnId,
      widgetType: 'button',
    })

    const widgets = result.design.sections[0].columns[0].widgets
    expect(widgets).toHaveLength(2)
    expect(widgets[1].type).toBe('button')
  })

  it('inserts at atIndex when provided', () => {
    const initial = makePopulatedState()
    const sectionId = initial.design.sections[0].id
    const columnId = initial.design.sections[0].columns[0].id

    const result = blockDesignerReducer(initial, {
      type: 'ADD_WIDGET',
      sectionId,
      columnId,
      widgetType: 'button',
      atIndex: 0,
    })

    const widgets = result.design.sections[0].columns[0].widgets
    expect(widgets).toHaveLength(2)
    expect(widgets[0].type).toBe('button')
    expect(widgets[1].type).toBe('text')
  })

  it('selects the new widget', () => {
    const initial = makePopulatedState()
    const sectionId = initial.design.sections[0].id
    const columnId = initial.design.sections[0].columns[0].id

    const result = blockDesignerReducer(initial, {
      type: 'ADD_WIDGET',
      sectionId,
      columnId,
      widgetType: 'spacer',
    })

    const newWidget = result.design.sections[0].columns[0].widgets[1]
    expect(result.selection?.type).toBe('widget')
    expect(result.selection?.widgetId).toBe(newWidget.id)
    expect(result.selection?.sectionId).toBe(sectionId)
    expect(result.selection?.columnId).toBe(columnId)
  })
})

// ---------------------------------------------------------------------------
// REMOVE_WIDGET
// ---------------------------------------------------------------------------

describe('REMOVE_WIDGET', () => {
  it('removes the widget from the column', () => {
    const initial = makePopulatedState()
    const sectionId = initial.design.sections[0].id
    const columnId = initial.design.sections[0].columns[0].id
    const widgetId = initial.design.sections[0].columns[0].widgets[0].id

    const result = blockDesignerReducer(initial, {
      type: 'REMOVE_WIDGET',
      sectionId,
      columnId,
      widgetId,
    })

    expect(result.design.sections[0].columns[0].widgets).toHaveLength(0)
  })

  it('clears selection if the removed widget was selected', () => {
    const initial = makePopulatedState()
    const sectionId = initial.design.sections[0].id
    const columnId = initial.design.sections[0].columns[0].id
    const widgetId = initial.design.sections[0].columns[0].widgets[0].id
    initial.selection = { type: 'widget', sectionId, columnId, widgetId }

    const result = blockDesignerReducer(initial, {
      type: 'REMOVE_WIDGET',
      sectionId,
      columnId,
      widgetId,
    })

    expect(result.selection).toBeNull()
  })

  it('preserves selection if a different widget was selected', () => {
    const initial = makePopulatedState()
    const sectionId = initial.design.sections[0].id
    const columnId = initial.design.sections[0].columns[0].id
    const widgetId = initial.design.sections[0].columns[0].widgets[0].id
    initial.selection = { type: 'widget', sectionId, columnId, widgetId: 'other-widget' }

    const result = blockDesignerReducer(initial, {
      type: 'REMOVE_WIDGET',
      sectionId,
      columnId,
      widgetId,
    })

    expect(result.selection?.widgetId).toBe('other-widget')
  })
})

// ---------------------------------------------------------------------------
// DUPLICATE_WIDGET
// ---------------------------------------------------------------------------

describe('DUPLICATE_WIDGET', () => {
  it('creates a clone with a new ID and inserts after the original', () => {
    const initial = makePopulatedState()
    const sectionId = initial.design.sections[0].id
    const columnId = initial.design.sections[0].columns[0].id
    const widgetId = initial.design.sections[0].columns[0].widgets[0].id

    const result = blockDesignerReducer(initial, {
      type: 'DUPLICATE_WIDGET',
      sectionId,
      columnId,
      widgetId,
    })

    const widgets = result.design.sections[0].columns[0].widgets
    expect(widgets).toHaveLength(2)
    expect(widgets[0].id).toBe(widgetId)
    expect(widgets[1].id).not.toBe(widgetId)
    expect(widgets[1].label).toContain('(copy)')
    expect(widgets[1].type).toBe('text')
  })

  it('selects the cloned widget', () => {
    const initial = makePopulatedState()
    const sectionId = initial.design.sections[0].id
    const columnId = initial.design.sections[0].columns[0].id
    const widgetId = initial.design.sections[0].columns[0].widgets[0].id

    const result = blockDesignerReducer(initial, {
      type: 'DUPLICATE_WIDGET',
      sectionId,
      columnId,
      widgetId,
    })

    const clonedWidget = result.design.sections[0].columns[0].widgets[1]
    expect(result.selection?.widgetId).toBe(clonedWidget.id)
  })

  it('returns state unchanged if widget not found', () => {
    const initial = makePopulatedState()
    const sectionId = initial.design.sections[0].id
    const columnId = initial.design.sections[0].columns[0].id

    const result = blockDesignerReducer(initial, {
      type: 'DUPLICATE_WIDGET',
      sectionId,
      columnId,
      widgetId: 'nonexistent',
    })

    expect(result).toBe(initial)
  })
})

// ---------------------------------------------------------------------------
// REORDER_WIDGETS
// ---------------------------------------------------------------------------

describe('REORDER_WIDGETS', () => {
  it('reorders widgets within a column by provided ids', () => {
    // Add a second widget first
    const initial = makePopulatedState()
    const sectionId = initial.design.sections[0].id
    const columnId = initial.design.sections[0].columns[0].id

    const withSecond = blockDesignerReducer(initial, {
      type: 'ADD_WIDGET',
      sectionId,
      columnId,
      widgetType: 'button',
    })

    const widgets = withSecond.design.sections[0].columns[0].widgets
    const id1 = widgets[0].id
    const id2 = widgets[1].id

    const result = blockDesignerReducer(withSecond, {
      type: 'REORDER_WIDGETS',
      sectionId,
      columnId,
      widgetIds: [id2, id1],
    })

    const reordered = result.design.sections[0].columns[0].widgets
    expect(reordered[0].id).toBe(id2)
    expect(reordered[1].id).toBe(id1)
  })
})

// ---------------------------------------------------------------------------
// MOVE_WIDGET
// ---------------------------------------------------------------------------

describe('MOVE_WIDGET', () => {
  it('moves a widget between columns', () => {
    // Create a section with two columns
    const widget = createTextWidget()
    const col1 = createColumn(50)
    col1.widgets = [widget]
    const col2 = createColumn(50)
    const section = createSection()
    section.columns = [col1, col2]
    const design: HeroBlockDesign = {
      version: 4,
      sections: [section],
      globalStyles: { backgroundColor: '#ffffff', maxWidth: 1200 },
    }
    const initial = makeState({ design })

    const result = blockDesignerReducer(initial, {
      type: 'MOVE_WIDGET',
      fromSectionId: section.id,
      fromColumnId: col1.id,
      widgetId: widget.id,
      toSectionId: section.id,
      toColumnId: col2.id,
      toIndex: 0,
    })

    expect(result.design.sections[0].columns[0].widgets).toHaveLength(0)
    expect(result.design.sections[0].columns[1].widgets).toHaveLength(1)
    expect(result.design.sections[0].columns[1].widgets[0].id).toBe(widget.id)
  })

  it('updates selection to the target location', () => {
    const widget = createTextWidget()
    const col1 = createColumn(50)
    col1.widgets = [widget]
    const col2 = createColumn(50)
    const section = createSection()
    section.columns = [col1, col2]
    const design: HeroBlockDesign = {
      version: 4,
      sections: [section],
      globalStyles: { backgroundColor: '#ffffff', maxWidth: 1200 },
    }
    const initial = makeState({ design })

    const result = blockDesignerReducer(initial, {
      type: 'MOVE_WIDGET',
      fromSectionId: section.id,
      fromColumnId: col1.id,
      widgetId: widget.id,
      toSectionId: section.id,
      toColumnId: col2.id,
      toIndex: 0,
    })

    expect(result.selection?.type).toBe('widget')
    expect(result.selection?.widgetId).toBe(widget.id)
    expect(result.selection?.columnId).toBe(col2.id)
  })
})

// ---------------------------------------------------------------------------
// UPDATE_WIDGET_PROPS
// ---------------------------------------------------------------------------

describe('UPDATE_WIDGET_PROPS', () => {
  it('merges into props for desktop breakpoint', () => {
    const initial = makePopulatedState()
    const sectionId = initial.design.sections[0].id
    const columnId = initial.design.sections[0].columns[0].id
    const widgetId = initial.design.sections[0].columns[0].widgets[0].id

    const result = blockDesignerReducer(initial, {
      type: 'UPDATE_WIDGET_PROPS',
      sectionId,
      columnId,
      widgetId,
      props: { kind: 'text', fontSize: 72 } as Partial<TextWidgetProps>,
    })

    const widget = result.design.sections[0].columns[0].widgets[0]
    expect((widget.props as TextWidgetProps).fontSize).toBe(72)
    // Other props preserved
    expect((widget.props as TextWidgetProps).content).toBe('Your Heading Here')
  })

  it('stores in responsiveOverrides for non-desktop breakpoint', () => {
    const initial = makePopulatedState()
    const sectionId = initial.design.sections[0].id
    const columnId = initial.design.sections[0].columns[0].id
    const widgetId = initial.design.sections[0].columns[0].widgets[0].id

    const result = blockDesignerReducer(initial, {
      type: 'UPDATE_WIDGET_PROPS',
      sectionId,
      columnId,
      widgetId,
      props: { kind: 'text', fontSize: 24 } as Partial<TextWidgetProps>,
      breakpoint: 'mobile',
    })

    const widget = result.design.sections[0].columns[0].widgets[0]
    expect(widget.responsiveOverrides?.mobile?.props).toBeDefined()
    expect((widget.responsiveOverrides?.mobile?.props as Partial<TextWidgetProps>)?.fontSize).toBe(24)
    // Desktop unchanged
    expect((widget.props as TextWidgetProps).fontSize).toBe(48)
  })
})

// ---------------------------------------------------------------------------
// UPDATE_WIDGET_SETTINGS
// ---------------------------------------------------------------------------

describe('UPDATE_WIDGET_SETTINGS', () => {
  it('merges settings into widget for desktop', () => {
    const initial = makePopulatedState()
    const sectionId = initial.design.sections[0].id
    const columnId = initial.design.sections[0].columns[0].id
    const widgetId = initial.design.sections[0].columns[0].widgets[0].id

    const result = blockDesignerReducer(initial, {
      type: 'UPDATE_WIDGET_SETTINGS',
      sectionId,
      columnId,
      widgetId,
      settings: { alignment: 'left', width: '50%' },
    })

    const widget = result.design.sections[0].columns[0].widgets[0]
    expect(widget.alignment).toBe('left')
    expect(widget.width).toBe('50%')
  })

  it('stores in responsiveOverrides for non-desktop', () => {
    const initial = makePopulatedState()
    const sectionId = initial.design.sections[0].id
    const columnId = initial.design.sections[0].columns[0].id
    const widgetId = initial.design.sections[0].columns[0].widgets[0].id

    const result = blockDesignerReducer(initial, {
      type: 'UPDATE_WIDGET_SETTINGS',
      sectionId,
      columnId,
      widgetId,
      settings: { alignment: 'right' },
      breakpoint: 'tablet',
    })

    const widget = result.design.sections[0].columns[0].widgets[0]
    expect(widget.responsiveOverrides?.tablet?.alignment).toBe('right')
    // Desktop unchanged
    expect(widget.alignment).toBe('center')
  })
})

// ---------------------------------------------------------------------------
// UPDATE_WIDGET_ANIMATION
// ---------------------------------------------------------------------------

describe('UPDATE_WIDGET_ANIMATION', () => {
  it('merges into widget animation', () => {
    const initial = makePopulatedState()
    const sectionId = initial.design.sections[0].id
    const columnId = initial.design.sections[0].columns[0].id
    const widgetId = initial.design.sections[0].columns[0].widgets[0].id

    const result = blockDesignerReducer(initial, {
      type: 'UPDATE_WIDGET_ANIMATION',
      sectionId,
      columnId,
      widgetId,
      animation: { type: 'fadeIn', duration: 600 },
    })

    const widget = result.design.sections[0].columns[0].widgets[0]
    expect(widget.animation.type).toBe('fadeIn')
    expect(widget.animation.duration).toBe(600)
    // Delay preserved from default
    expect(widget.animation.delay).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// UPDATE_GLOBAL_STYLES
// ---------------------------------------------------------------------------

describe('UPDATE_GLOBAL_STYLES', () => {
  it('merges into design globalStyles', () => {
    const initial = makeState()

    const result = blockDesignerReducer(initial, {
      type: 'UPDATE_GLOBAL_STYLES',
      styles: { backgroundColor: '#333333' },
    })

    expect(result.design.globalStyles.backgroundColor).toBe('#333333')
    // Other global styles preserved
    expect(result.design.globalStyles.maxWidth).toBe(1200)
  })

  it('pushes history', () => {
    const initial = makeState()

    const result = blockDesignerReducer(initial, {
      type: 'UPDATE_GLOBAL_STYLES',
      styles: { maxWidth: 960 },
    })

    expect(result.history).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// SELECT_BLOCK
// ---------------------------------------------------------------------------

describe('SELECT_BLOCK', () => {
  it('sets the selection', () => {
    const initial = makePopulatedState()
    const sectionId = initial.design.sections[0].id

    const result = blockDesignerReducer(initial, {
      type: 'SELECT_BLOCK',
      selection: { type: 'section', sectionId },
    })

    expect(result.selection?.type).toBe('section')
    expect(result.selection?.sectionId).toBe(sectionId)
  })

  it('clears the selection when null', () => {
    const initial = makePopulatedState()
    initial.selection = { type: 'section', sectionId: 'some-id' }

    const result = blockDesignerReducer(initial, {
      type: 'SELECT_BLOCK',
      selection: null,
    })

    expect(result.selection).toBeNull()
  })

  it('does not push history', () => {
    const initial = makeState()

    const result = blockDesignerReducer(initial, {
      type: 'SELECT_BLOCK',
      selection: null,
    })

    expect(result.history).toEqual([])
    expect(result.historyIndex).toBe(-1)
  })
})

// ---------------------------------------------------------------------------
// SET_BREAKPOINT
// ---------------------------------------------------------------------------

describe('SET_BREAKPOINT', () => {
  it('sets the active breakpoint', () => {
    const initial = makeState()

    const result = blockDesignerReducer(initial, {
      type: 'SET_BREAKPOINT',
      breakpoint: 'tablet',
    })

    expect(result.activeBreakpoint).toBe('tablet')
  })

  it('does not push history', () => {
    const initial = makeState()

    const result = blockDesignerReducer(initial, {
      type: 'SET_BREAKPOINT',
      breakpoint: 'mobile',
    })

    expect(result.history).toEqual([])
    expect(result.historyIndex).toBe(-1)
  })
})

// ---------------------------------------------------------------------------
// UNDO / REDO
// ---------------------------------------------------------------------------

describe('UNDO / REDO', () => {
  it('UNDO restores previous design from history', () => {
    const initial = makeState()

    // Perform an action that pushes history
    const afterAdd = blockDesignerReducer(initial, {
      type: 'ADD_SECTION',
      columnWidths: [100],
    })
    expect(afterAdd.design.sections).toHaveLength(1)

    // Undo
    const afterUndo = blockDesignerReducer(afterAdd, { type: 'UNDO' })
    expect(afterUndo.design.sections).toHaveLength(0)
    expect(afterUndo.historyIndex).toBe(-1)
  })

  it('REDO restores next design from history after undo', () => {
    const initial = makeState()

    // Perform an action
    const afterAdd = blockDesignerReducer(initial, {
      type: 'ADD_SECTION',
      columnWidths: [100],
    })

    // Undo
    const afterUndo = blockDesignerReducer(afterAdd, { type: 'UNDO' })
    expect(afterUndo.design.sections).toHaveLength(0)

    // Redo
    const afterRedo = blockDesignerReducer(afterUndo, { type: 'REDO' })
    expect(afterRedo.design.sections).toHaveLength(1)
    expect(afterRedo.historyIndex).toBe(0)
  })

  it('UNDO does nothing when historyIndex is -1', () => {
    const initial = makeState()
    const result = blockDesignerReducer(initial, { type: 'UNDO' })
    expect(result).toBe(initial)
  })

  it('REDO does nothing when at the end of history', () => {
    const initial = makeState()
    const afterAdd = blockDesignerReducer(initial, {
      type: 'ADD_SECTION',
      columnWidths: [100],
    })

    const result = blockDesignerReducer(afterAdd, { type: 'REDO' })
    expect(result).toBe(afterAdd)
  })

  it('multiple undo/redo cycles work correctly', () => {
    let state = makeState()

    // Add section 1
    state = blockDesignerReducer(state, {
      type: 'ADD_SECTION',
      columnWidths: [100],
    })
    expect(state.design.sections).toHaveLength(1)

    // Add section 2
    state = blockDesignerReducer(state, {
      type: 'ADD_SECTION',
      columnWidths: [50, 50],
    })
    expect(state.design.sections).toHaveLength(2)

    // Undo to 1 section
    state = blockDesignerReducer(state, { type: 'UNDO' })
    expect(state.design.sections).toHaveLength(1)

    // Undo to 0 sections
    state = blockDesignerReducer(state, { type: 'UNDO' })
    expect(state.design.sections).toHaveLength(0)

    // Redo to 1 section
    state = blockDesignerReducer(state, { type: 'REDO' })
    expect(state.design.sections).toHaveLength(1)

    // Redo to 2 sections
    state = blockDesignerReducer(state, { type: 'REDO' })
    expect(state.design.sections).toHaveLength(2)
  })

  it('new action after undo truncates redo history', () => {
    let state = makeState()

    // Add two sections
    state = blockDesignerReducer(state, {
      type: 'ADD_SECTION',
      columnWidths: [100],
    })
    state = blockDesignerReducer(state, {
      type: 'ADD_SECTION',
      columnWidths: [50, 50],
    })

    // Undo once
    state = blockDesignerReducer(state, { type: 'UNDO' })
    expect(state.design.sections).toHaveLength(1)

    // New action (should truncate redo stack)
    state = blockDesignerReducer(state, {
      type: 'ADD_SECTION',
      columnWidths: [33, 34, 33],
    })
    expect(state.design.sections).toHaveLength(2)

    // Redo should do nothing now (future was truncated)
    const afterRedo = blockDesignerReducer(state, { type: 'REDO' })
    expect(afterRedo).toBe(state)
  })

  it('history is capped at MAX_HISTORY (50) entries', () => {
    let state = makeState()

    // Perform 55 actions
    for (let i = 0; i < 55; i++) {
      state = blockDesignerReducer(state, {
        type: 'UPDATE_GLOBAL_STYLES',
        styles: { maxWidth: 1000 + i },
      })
    }

    expect(state.history.length).toBeLessThanOrEqual(50)
  })
})
