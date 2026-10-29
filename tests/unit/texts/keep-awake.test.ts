import { allKeepAwakeGuides, keepAwakeBrandOf, keepAwakeGuideFor } from '@/lib/texts/keep-awake'

describe('keepAwakeBrandOf', () => {
  test.each([
    ['INFINIX MOBILITY LIMITED', 'Infinix X6840', 'transsion'],
    ['TECNO', 'TECNO KJ5', 'transsion'],
    ['itel', 'A665L', 'transsion'],
    ['Xiaomi', 'Redmi Note 13', 'xiaomi'],
    [null, 'POCO X6', 'xiaomi'],
    ['samsung', 'SM-N970F', 'samsung'],
    ['realme', 'RMX3710', 'oppo'],
    ['vivo', 'V2207', 'oppo'],
    ['Google', 'Pixel 7', 'other'],
    [null, null, 'other'],
  ])('%s %s → %s', (manufacturer, model, brand) => {
    expect(keepAwakeBrandOf(manufacturer, model)).toBe(brand)
  })
})

describe('keep-awake guides', () => {
  test('every brand tells the owner to take the battery limits off SmartMenu', () => {
    for (const guide of allKeepAwakeGuides()) {
      expect(guide.steps.length).toBeGreaterThan(1)
      expect(guide.steps.join(' ')).toMatch(/Unrestricted|No restrictions|background/i)
    }
  })

  test('Infinix phones get Auto-start and background running', () => {
    const steps = keepAwakeGuideFor('INFINIX MOBILITY LIMITED', 'Infinix X6840').steps.join(' ')
    expect(steps).toMatch(/Auto-start/)
    expect(steps).toMatch(/Background running/)
    expect(steps).toMatch(/lock it in recent apps/)
  })

  test('Samsung phones get Never sleeping apps', () => {
    expect(keepAwakeGuideFor('samsung').steps.join(' ')).toMatch(/Never sleeping apps/)
  })
})
