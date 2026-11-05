import { blockDef } from '@/lib/page-designer/blocks'
import { applyTokens, firstNameToken, resolveBlockOption, resolveBlockText } from '@/lib/page-designer/text'
import { readConfirmationRedirect, resolvePageDesign } from '@/lib/page-designer/page-mode'
import { createStandardDesign } from '@/lib/page-designer/standard-designs'
import { STOREFRONT_LABEL_KEYS } from '@/lib/storefront-labels'
import { labelKeysInUse } from '@/lib/page-designer/text'

describe('resolveBlockText', () => {
  const def = blockDef('tracking.back')!

  it('prefers the owner’s text, then the store label, then the default', () => {
    expect(resolveBlockText(def, 'label', { label: 'Order again' }, { 'tracking.back': 'Menu' })).toBe('Order again')
    expect(resolveBlockText(def, 'label', {}, { 'tracking.back': 'Menu' })).toBe('Menu')
    expect(resolveBlockText(def, 'label', {}, {})).toBe('Back to menu')
  })

  it('ignores blank, over-long and inherited values', () => {
    expect(resolveBlockText(def, 'label', { label: '   ' }, {})).toBe('Back to menu')
    expect(resolveBlockText(def, 'label', { label: 'x'.repeat(41) }, {})).toBe('Back to menu')
    expect(resolveBlockText(def, 'constructor', {}, {})).toBe('')
    expect(resolveBlockText(def, 'label', Object.create({ label: 'proto' }), {})).toBe('Back to menu')
  })

  it('shares only real storefront label keys', () => {
    for (const key of labelKeysInUse()) expect(STOREFRONT_LABEL_KEYS).toContain(key)
  })
})

describe('resolveBlockOption', () => {
  const def = blockDef('tracking.header')!
  it('falls back to the default for missing or mistyped values', () => {
    expect(resolveBlockOption(def, 'show_live_badge', {})).toBe(true)
    expect(resolveBlockOption(def, 'show_live_badge', { show_live_badge: 'no' })).toBe(true)
    expect(resolveBlockOption(def, 'show_live_badge', { show_live_badge: false })).toBe(false)
    expect(resolveBlockOption(def, 'nope', {})).toBeUndefined()
  })
})

describe('applyTokens', () => {
  it('replaces known tokens and leaves unknown ones as typed', () => {
    expect(applyTokens('Hi {name}, order {order_number} {unknown}', { name: 'Maria', order_number: '#07' })).toBe('Hi Maria, order #07 {unknown}')
  })

  it('drops an empty token with the space or comma before it', () => {
    expect(applyTokens('Hi {name}!', { name: '' })).toBe('Hi!')
    expect(applyTokens('Thanks, {name}.', { name: '' })).toBe('Thanks.')
  })

  it('never reads inherited keys', () => {
    expect(applyTokens('{constructor}', {})).toBe('{constructor}')
  })

  it('keeps first names short', () => {
    expect(firstNameToken('  Maria Clara Santos ')).toBe('Maria')
    expect(firstNameToken(undefined)).toBe('')
  })
})

describe('page mode', () => {
  const design = JSON.stringify(createStandardDesign('tracking'))

  it('is off unless enabled AND a design is stored', () => {
    expect(resolvePageDesign({ tracking_design: design }, 'tracking')).toBeNull()
    expect(resolvePageDesign({ tracking_design_enabled: true }, 'tracking')).toBeNull()
    expect(resolvePageDesign({ tracking_design: design, tracking_design_enabled: true }, 'tracking')).not.toBeNull()
    expect(resolvePageDesign({ tracking_design: 'not json', tracking_design_enabled: true }, 'tracking')).toBeNull()
  })

  it('reads the thank-you hand-off, defaulting to instant', () => {
    expect(readConfirmationRedirect({})).toEqual({ mode: 'instant', seconds: 5 })
    expect(readConfirmationRedirect({ confirmation_redirect: 'countdown', confirmation_redirect_seconds: 10 })).toEqual({ mode: 'countdown', seconds: 10 })
    expect(readConfirmationRedirect({ confirmation_redirect: 'weird', confirmation_redirect_seconds: 999 })).toEqual({ mode: 'instant', seconds: 5 })
  })
})

describe('published design columns', () => {
  it('copies only the design text of published pages', async () => {
    const { hasPublishedFlag, publishedDesignColumns } = await import('@/lib/page-designer/page-mode')
    const row = { checkout_design: 'C', checkout_design_enabled: true, confirmation_design: 'T', confirmation_design_enabled: false }
    expect(publishedDesignColumns(row, ['checkout', 'confirmation'])).toEqual({ checkout_design: 'C' })
    expect(hasPublishedFlag(row, ['confirmation'])).toBe(false)
    expect(hasPublishedFlag(row, ['checkout', 'confirmation'])).toBe(true)
  })

  it('keeps the design text out of the shared storefront select (menu visitors never download it)', async () => {
    const { TENANT_STOREFRONT_SELECT } = await import('@/lib/queries/tenant-storefront-select')
    const columns = TENANT_STOREFRONT_SELECT.split(',').map((c) => c.trim())
    for (const page of ['checkout', 'confirmation', 'tracking']) {
      expect(columns).toContain(`${page}_design_enabled`)
      expect(columns).not.toContain(`${page}_design`)
    }
  })
})
