import { FlashList, type FlashListRef, type ViewToken } from '@shopify/flash-list'
import { useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CategoryChips } from '@/components/menu/category-chips'
import { MenuItemRow } from '@/components/menu/menu-item-row'
import { OrderHeader } from '@/components/menu/order-header'
import { AppText } from '@/components/ui/app-text'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppConfig, useCatalog } from '@/lib/data/hooks'
import { buildMenuRows, type MenuRow } from '@/lib/menu/menu-rows'
import { sectionForIndex } from '@/lib/menu/scroll-spy'
import { useCart } from '@/lib/stores/cart'
import { useTokens } from '@/theme/theme-context'

function MenuSkeleton() {
  const { space } = useTokens()
  return (
    <View style={{ padding: space.lg, gap: space.xl }}>
      {[0, 1, 2, 3].map((key) => (
        <View key={key} style={{ flexDirection: 'row', gap: space.lg }}>
          <View style={{ flex: 1, gap: space.sm }}>
            <Skeleton height={18} width="60%" />
            <Skeleton height={14} />
            <Skeleton height={16} width="25%" />
          </View>
          <Skeleton width={104} height={104} />
        </View>
      ))}
    </View>
  )
}

export default function OrderScreen() {
  const { colors, space } = useTokens()
  const insets = useSafeAreaInsets()
  const { category: requestedCategory } = useLocalSearchParams<{ category?: string }>()
  const { data: config } = useAppConfig()
  const { data: catalog, isPending } = useCatalog()
  const { mode, setMode, outletId, setOutlet } = useCart()
  const [query, setQuery] = useState('')
  const [activeSection, setActiveSection] = useState(0)
  const listRef = useRef<FlashListRef<MenuRow>>(null)
  const isJumping = useRef(false)

  const menu = useMemo(
    () => (catalog ? buildMenuRows(catalog.categories, catalog.items, query) : { rows: [], headerIndices: [], sections: [] }),
    [catalog, query],
  )
  const outlet = catalog?.outlets.find((candidate) => candidate.id === outletId) ?? catalog?.outlets[0]

  useEffect(() => {
    if (!outletId && catalog?.outlets[0]) setOutlet(catalog.outlets[0].id)
  }, [catalog, outletId, setOutlet])

  const jumpToSection = useCallback(
    (index: number) => {
      const rowIndex = menu.headerIndices[index]
      if (rowIndex === undefined) return
      isJumping.current = true
      setActiveSection(index)
      listRef.current?.scrollToIndex({ index: rowIndex, animated: true })
      setTimeout(() => (isJumping.current = false), 600)
    },
    [menu.headerIndices],
  )

  useEffect(() => {
    if (!requestedCategory) return
    const index = menu.sections.findIndex((section) => section.id === requestedCategory)
    if (index >= 0) setTimeout(() => jumpToSection(index), 250)
  }, [requestedCategory, menu.sections, jumpToSection])

  const headerIndicesRef = useRef(menu.headerIndices)
  headerIndicesRef.current = menu.headerIndices
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<MenuRow>[] }) => {
    if (isJumping.current) return
    const first = viewableItems.find((token) => token.isViewable)?.index
    if (first !== null && first !== undefined) setActiveSection(sectionForIndex(first, headerIndicesRef.current))
  }).current

  if (!config) return null

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + space.md }}>
      <AppText variant="display" style={{ paddingHorizontal: space.lg, marginBottom: space.md }} accessibilityRole="header">
        Menu
      </AppText>
      <OrderHeader
        features={config.features}
        mode={mode}
        onModeChange={setMode}
        outlet={outlet}
        query={query}
        onQueryChange={setQuery}
      />
      {isPending ? (
        <MenuSkeleton />
      ) : (
        <>
          {query === '' ? <CategoryChips categories={menu.sections} activeIndex={activeSection} onSelect={jumpToSection} /> : null}
          <View style={{ height: 1, backgroundColor: colors.border }} />
          <FlashList
            ref={listRef}
            data={menu.rows}
            keyExtractor={(row) => row.key}
            getItemType={(row) => row.type}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={{ itemVisiblePercentThreshold: 10 }}
            contentContainerStyle={{ paddingBottom: 140 }}
            ListEmptyComponent={
              <AppText variant="body" color="textMuted" align="center" style={{ marginTop: space.xxl }}>
                Nothing matches “{query}”.
              </AppText>
            }
            renderItem={({ item: row }) =>
              row.type === 'header' ? (
                <View style={{ paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.xs }}>
                  <AppText variant="title" accessibilityRole="header">
                    {row.category.name}
                  </AppText>
                  {row.category.description ? (
                    <AppText variant="callout" color="textMuted">
                      {row.category.description}
                    </AppText>
                  ) : null}
                </View>
              ) : (
                <MenuItemRow item={row.item} />
              )
            }
          />
        </>
      )}
    </View>
  )
}
