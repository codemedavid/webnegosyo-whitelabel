import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { View, StyleSheet, TouchableOpacity, Text, ActivityIndicator } from 'react-native'
import type { SectionList, ViewToken } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, CART_BRANDING_OVERRIDES } from '@/theme/provider'
import { useCategories } from '@/lib/queries/use-categories'
import { useMenuItems } from '@/lib/queries/use-menu-items'
import { useCartStore, useCartHydrated } from '@/stores/cart-store'
import { CategorySidebar } from '@/components/menu/category-tabs'
import { SearchBar } from '@/components/menu/search-bar'
import { MenuGrid, chunkItems } from '@/components/menu/menu-grid'
import type { MenuSection } from '@/components/menu/menu-grid'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { Skeleton } from '@/components/ui/skeleton'
import type { MenuItem, Category } from '@/types/database'

export default function MenuScreen() {
  const { theme, tenant } = useTheme()
  const { data: categories = [], isLoading: isCategoriesLoading } = useCategories(tenant?.id)
  const { data: menuItems = [], isLoading: isMenuLoading } = useMenuItems(tenant?.id)
  const isCartHydrated = useCartHydrated()
  const selectedOrderTypeId = useCartStore(s => s.orderType)
  const itemCount = useCartStore(s => s.itemCount)
  const cartIconName = CART_BRANDING_OVERRIDES.iconName && CART_BRANDING_OVERRIDES.iconName in Ionicons.glyphMap
    ? CART_BRANDING_OVERRIDES.iconName as keyof typeof Ionicons.glyphMap
    : 'cart-outline'
  const cartIconColor = CART_BRANDING_OVERRIDES.iconColor || theme.headerFont

  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)

  const sectionListRef = useRef<SectionList<MenuItem[], MenuSection>>(null)

  const numColumns = tenant?.mobile_grid_columns === 2 ? 2 : 1
  const hideCurrencySymbol = tenant?.menu_engineering_enabled && tenant?.hide_currency_symbol

  // Build sections grouped by category
  const { sections, sectionCategories } = useMemo(() => {
    let items = menuItems

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      items = items.filter(
        i => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)
      )
    }

    const builtSections: MenuSection[] = []
    const cats: Category[] = []

    // Group items by category
    for (const category of categories) {
      const categoryItems = items.filter(item => item.category_id === category.id)
      if (categoryItems.length > 0) {
        builtSections.push({
          category,
          data: chunkItems(categoryItems, numColumns),
        })
        cats.push(category)
      }
    }

    // Uncategorized items at the end
    const uncategorized = items.filter(item => !item.category_id)
    if (uncategorized.length > 0) {
      const otherCategory = {
        id: 'uncategorized',
        tenant_id: '',
        name: 'Other Items',
        icon: '🍽️',
        order: 9999,
        is_active: true,
        created_at: '',
        updated_at: '',
      } as Category
      builtSections.push({
        category: otherCategory,
        data: chunkItems(uncategorized, numColumns),
      })
      cats.push(otherCategory)
    }

    return { sections: builtSections, sectionCategories: cats }
  }, [menuItems, categories, searchQuery, numColumns])

  // Set initial active category
  useEffect(() => {
    if (sectionCategories.length > 0 && !activeCategoryId) {
      setActiveCategoryId(sectionCategories[0].id)
    }
  }, [sectionCategories, activeCategoryId])

  const handleItemPress = useCallback((item: MenuItem) => {
    router.push(`/(main)/item/${item.id}`)
  }, [])

  const handleScrollToCategory = useCallback((sectionIndex: number) => {
    sectionListRef.current?.scrollToLocation({
      sectionIndex,
      itemIndex: 0,
      animated: true,
    })
    if (sectionCategories[sectionIndex]) {
      setActiveCategoryId(sectionCategories[sectionIndex].id)
    }
  }, [sectionCategories])

  // Track which section is visible as user scrolls
  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      for (const viewable of viewableItems) {
        const section = viewable.section as MenuSection | undefined
        if (section?.category) {
          setActiveCategoryId(section.category.id)
          break
        }
      }
    },
    []
  )

  const viewabilityConfig = useMemo(
    () => ({
      itemVisiblePercentThreshold: 50,
      minimumViewTime: 100,
    }),
    []
  )

  const isLoading = isCategoriesLoading || isMenuLoading
  const hasSidebar = sectionCategories.length > 1

  useEffect(() => {
    if (isCartHydrated && !selectedOrderTypeId) {
      router.replace('/(main)/home')
    }
  }, [isCartHydrated, selectedOrderTypeId])

  if (!isCartHydrated || !selectedOrderTypeId) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <View style={styles.orderTypeRedirect}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.orderTypeRedirectText, { color: theme.textSecondary }]}>
            Redirecting to home...
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.header }]}>
        <View style={styles.headerLeft}>
          {tenant?.logo_url ? (
            <OptimizedImage source={tenant.logo_url} style={styles.logo} contentFit="contain" />
          ) : null}
          <Text style={[styles.headerTitle, { color: theme.menuMainHeaderText }]} numberOfLines={1}>
            {tenant?.name || 'Loading...'}
          </Text>
        </View>
        <TouchableOpacity style={styles.cartButton} onPress={() => router.push('/(main)/cart')}>
          <Ionicons name={cartIconName} size={24} color={cartIconColor} />
          {itemCount > 0 ? (
            <View style={[styles.cartBadge, { backgroundColor: theme.menuCartBadgeBackground }]}>
              <Text style={[styles.cartBadgeText, { color: theme.menuCartBadgeText }]}>
                {itemCount}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      {/* Announcement */}
      {tenant?.is_announcement_visible && tenant?.announcement_text ? (
        <View
          style={[
            styles.announcement,
            { backgroundColor: tenant.announcement_bg_color || '#FFF4E5' },
          ]}
        >
          <Text
            style={[
              styles.announcementText,
              { color: tenant.announcement_text_color || '#663C00' },
            ]}
          >
            {tenant.announcement_text}
          </Text>
        </View>
      ) : null}

      {/* Search bar above the sidebar + content row */}
      {!isLoading && (
        <SearchBar value={searchQuery} onChangeText={setSearchQuery} />
      )}

      {isLoading ? (
        <View style={styles.loading}>
          <Skeleton width="90%" height={44} style={{ marginBottom: 12 }} />
          <Skeleton width="90%" height={100} style={{ marginBottom: 12 }} />
          <Skeleton width="90%" height={100} style={{ marginBottom: 12 }} />
          <Skeleton width="90%" height={100} />
        </View>
      ) : (
        <View style={styles.contentRow}>
          {/* Left sidebar */}
          {hasSidebar && (
            <CategorySidebar
              categories={sectionCategories}
              activeCategoryId={activeCategoryId}
              onScrollToCategory={handleScrollToCategory}
            />
          )}

          {/* Right content — scrollable menu grid */}
          <View style={styles.gridContainer}>
            <MenuGrid
              ref={sectionListRef}
              sections={sections}
              onItemPress={handleItemPress}
              numColumns={numColumns}
              hideCurrencySymbol={hideCurrencySymbol || false}
              onViewableItemsChanged={handleViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
            />
          </View>
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
    zIndex: 10,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  logo: { width: 36, height: 36, borderRadius: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', flex: 1 },
  cartButton: { position: 'relative', padding: 4 },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  cartBadgeText: { fontSize: 11, fontWeight: '700' },
  announcement: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  announcementText: { fontSize: 13, textAlign: 'center' },
  loading: { padding: 16, alignItems: 'center' },
  orderTypeRedirect: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderTypeRedirectText: {
    marginTop: 12,
    fontSize: 14,
  },
  contentRow: {
    flex: 1,
    flexDirection: 'row',
  },
  gridContainer: {
    flex: 1,
  },
})
