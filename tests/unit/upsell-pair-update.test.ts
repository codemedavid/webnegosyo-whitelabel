import { describe, it, expect } from '@jest/globals'
import { upsellPairUpdateSchema } from '@/lib/menu-engineering-service'

describe('upsellPairUpdateSchema', () => {
  it('applies no defaults so an omitted display_order/is_active is left alone', () => {
    expect(upsellPairUpdateSchema.parse({ source_label: 'Ala Carte' })).toEqual({ source_label: 'Ala Carte' })
  })

  it('accepts null to clear a label and rejects unknown display styles', () => {
    expect(upsellPairUpdateSchema.parse({ upgrade_header: null })).toEqual({ upgrade_header: null })
    expect(() => upsellPairUpdateSchema.parse({ upgrade_display_style: 'popup' })).toThrow()
  })
})
