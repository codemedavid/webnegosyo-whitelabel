import {
  CURATED_ICON_GROUPS,
  ALL_CURATED_ICONS,
  LUCIDE_PREFIX,
  isKnownCategoryIcon,
} from '@/lib/category-icon-catalog'
import {
  CURATED_ICON_GROUPS as APP_CURATED_ICON_GROUPS,
  ALL_CURATED_ICONS as APP_ALL_CURATED_ICONS,
  LUCIDE_PREFIX as APP_LUCIDE_PREFIX,
  isKnownCategoryIcon as appIsKnownCategoryIcon,
} from '../../webnegosyo-app/lib/category-icon-catalog'
import { CATEGORY_ICON_NODES } from '../../webnegosyo-app/lib/category-icon-paths'
import { ICON_COMPONENT_MAP } from '@/lib/category-icons'

/**
 * The category-icon vocabulary is duplicated, not shared: the web app and the
 * merchant app are separate builds with no common package.
 *
 * A category's icon is ONE stored string read by four surfaces — the web admin,
 * the storefront, the white-labeled customer app and now the merchant app. If
 * the app's copy offers a name the web does not know, the merchant picks an
 * icon that saves cleanly and then renders as nothing for their customers, with
 * nothing anywhere saying why. This test is what stands between the two copies
 * and that drift.
 */
describe('category icon catalog parity', () => {
  it('uses the same storage prefix in both packages', () => {
    expect(APP_LUCIDE_PREFIX).toBe(LUCIDE_PREFIX)
  })

  it('offers exactly the same icons, grouped the same way', () => {
    expect(APP_CURATED_ICON_GROUPS).toEqual(CURATED_ICON_GROUPS)
  })

  it('flattens to the same list, in the same order', () => {
    expect(APP_ALL_CURATED_ICONS).toEqual(ALL_CURATED_ICONS)
  })

  it('accepts and rejects the same stored values', () => {
    const cases = [undefined, '', '🍕', 'lucide:coffee', 'lucide:not-an-icon', 'lucide:'.repeat(4)]

    for (const value of cases) {
      expect(appIsKnownCategoryIcon(value)).toBe(isKnownCategoryIcon(value))
    }
  })
})

describe('category icon rendering parity', () => {
  it('draws in the app exactly what the web can render as a component', () => {
    const webRenderable = ALL_CURATED_ICONS.filter((name) => ICON_COMPONENT_MAP[name])
    const appDrawable = ALL_CURATED_ICONS.filter((name) => CATEGORY_ICON_NODES[name])

    expect(appDrawable).toEqual(webRenderable)
  })
})
