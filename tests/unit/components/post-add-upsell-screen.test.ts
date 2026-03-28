import { getUpsellMode } from '@/components/customer/post-add-upsell-screen'
import { createTestMenuItem } from '../../fixtures/menu-item.fixture'
import { createTestBundleWithSlots } from '../../fixtures/bundle.fixture'

describe('getUpsellMode', () => {
  const items = [createTestMenuItem(), createTestMenuItem({ id: 'item-2' })]
  const bundle = createTestBundleWithSlots()

  it('returns "pairs_only" when suggestions exist but no bundle', () => {
    expect(getUpsellMode(items, null)).toBe('pairs_only')
  })

  it('returns "bundle_only" when bundle exists but no suggestions', () => {
    expect(getUpsellMode([], bundle)).toBe('bundle_only')
  })

  it('returns "pairs_and_bundle" when both exist', () => {
    expect(getUpsellMode(items, bundle)).toBe('pairs_and_bundle')
  })

  it('returns null when neither exists', () => {
    expect(getUpsellMode([], null)).toBeNull()
  })
})
