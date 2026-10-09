import { createWidget } from '@/lib/hero-builder/defaults'
import { hasCustomWelcome, resolveCustomWelcomeDesign } from '@/lib/welcome-builder/welcome-mode'
import { modesFromOrderTypes, resolveWelcomeModes } from '@/lib/welcome-builder/modes'

import { column, designOf, section } from '../hero-builder/helpers'

const stored = JSON.stringify(designOf([section('s', [column('c', [createWidget('heading')])])]))

describe('resolveCustomWelcomeDesign — opt-in on both columns', () => {
  it('is off for every row that predates the columns', () => {
    expect(resolveCustomWelcomeDesign(null)).toBeNull()
    expect(resolveCustomWelcomeDesign({})).toBeNull()
    expect(hasCustomWelcome({ welcome_design: stored })).toBe(false)
  })

  it('is off when switched off, even with a design stored', () => {
    expect(resolveCustomWelcomeDesign({ welcome_design: stored, welcome_design_enabled: false })).toBeNull()
  })

  it('parses the TEXT column and guarantees a way in', () => {
    const design = resolveCustomWelcomeDesign({ welcome_design: stored, welcome_design_enabled: true })
    expect(design?.version).toBe(5)
    // The stored design had only a heading, so a start button was appended.
    expect(design?.sections).toHaveLength(2)
  })

  it('falls back to the classic screen for garbage or an empty design', () => {
    expect(resolveCustomWelcomeDesign({ welcome_design: '{nope', welcome_design_enabled: true })).toBeNull()
    expect(resolveCustomWelcomeDesign({ welcome_design: JSON.stringify(designOf([])), welcome_design_enabled: true })).toBeNull()
  })
})

describe('welcome order types', () => {
  it('offers the store’s enabled web order types in display order', () => {
    const orderTypes = [
      { type: 'delivery', is_enabled: true, available_on_web: true },
      { type: 'dine_in', is_enabled: true, available_on_web: true },
      { type: 'pickup', is_enabled: false, available_on_web: true },
      { type: 'grab', is_enabled: true, available_on_web: true },
    ]
    expect(modesFromOrderTypes(orderTypes)).toEqual(['dine_in', 'delivery'])
  })

  it('uses branch capabilities for the branch chooser', () => {
    const outlets = [
      { is_active: true, supports_dine_in: false, supports_pickup: true, supports_delivery: false },
      { is_active: false, supports_dine_in: true, supports_pickup: false, supports_delivery: true },
    ]
    expect(resolveWelcomeModes({ isBranchChooser: true, outlets, orderTypes: [] })).toEqual(['pickup'])
    expect(resolveWelcomeModes({ isBranchChooser: false, outlets, orderTypes: [{ type: 'delivery' }] })).toEqual(['delivery'])
  })
})
