import { describe, expect, it } from '@jest/globals'
import { tenantSchema } from '@/lib/tenants-service'

const MINIMAL = {
  name: 'Store',
  slug: 'store',
  primary_color: '#111111',
  secondary_color: '#666666',
}

const COLOR_FIELDS = Object.keys(tenantSchema.shape).filter((field) => field.endsWith('_color'))

describe('tenantSchema colour fields', () => {
  it('finds the colour fields (guards this test against a rename)', () => {
    expect(COLOR_FIELDS.length).toBeGreaterThan(20)
    expect(COLOR_FIELDS).toEqual(expect.arrayContaining(['primary_color', 'header_color', 'flash_screen_text_color']))
  })

  it.each(COLOR_FIELDS)('%s refuses a value that would end its declaration', (field) => {
    expect(tenantSchema.safeParse({ ...MINIMAL, [field]: 'red;position:fixed' }).success).toBe(false)
  })

  it.each(COLOR_FIELDS)('%s keeps accepting a real colour', (field) => {
    expect(tenantSchema.safeParse({ ...MINIMAL, [field]: 'rgba(0, 0, 0, 0.5)' }).success).toBe(true)
  })

  it('an optional colour may still be blank', () => {
    expect(tenantSchema.safeParse({ ...MINIMAL, header_color: '' }).success).toBe(true)
  })
})
