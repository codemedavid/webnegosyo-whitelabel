import React, { forwardRef, useCallback } from 'react'
import { SectionList, View, Text, StyleSheet } from 'react-native'
import type { ViewToken } from 'react-native'
import { MenuItemCard } from '@/components/menu/menu-item-card'
import { useTheme } from '@/theme/provider'
import { setAlpha } from '@/lib/branding-utils'
import { Ionicons } from '@expo/vector-icons'
import type { MenuItem, Category } from '@/types/database'

export interface MenuSection {
  category: Category
  data: MenuItem[][]  // chunked into rows for grid layout
}

interface MenuGridProps {
  sections: MenuSection[]
  onItemPress: (item: MenuItem) => void
  numColumns: number
  hideCurrencySymbol?: boolean
  ListHeaderComponent?: React.ReactElement
  onViewableItemsChanged?: (info: { viewableItems: ViewToken[] }) => void
  viewabilityConfig?: object
}

export const MenuGrid = forwardRef<SectionList<MenuItem[], MenuSection>, MenuGridProps>(
  function MenuGrid(
    {
      sections,
      onItemPress,
      numColumns,
      hideCurrencySymbol,
      ListHeaderComponent,
      onViewableItemsChanged,
      viewabilityConfig,
    },
    ref
  ) {
    const { theme } = useTheme()
    const categoryHeaderColor = theme.menuCategoryHeader || theme.buttonPrimary

    const renderSectionHeader = useCallback(
      ({ section }: { section: MenuSection }) => (
        <View style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
          <View
            style={[
              styles.sectionIcon,
              { backgroundColor: setAlpha(categoryHeaderColor, 0.12) },
            ]}
          >
            <Text style={styles.sectionIconText}>{section.category.icon || '🍽️'}</Text>
          </View>
          <View>
            <Text style={[styles.sectionTitle, { color: categoryHeaderColor }]}>
              {section.category.name}
            </Text>
            <Text style={[styles.sectionCount, { color: theme.textMuted }]}>
              {section.data.reduce((sum, row) => sum + row.length, 0)}{' '}
              {section.data.reduce((sum, row) => sum + row.length, 0) === 1 ? 'item' : 'items'}
            </Text>
          </View>
        </View>
      ),
      [categoryHeaderColor, theme]
    )

    const renderRow = useCallback(
      ({ item: row }: { item: MenuItem[] }) => {
        if (numColumns === 1) {
          return (
            <MenuItemCard
              item={row[0]}
              onPress={() => onItemPress(row[0])}
              numColumns={1}
              hideCurrencySymbol={hideCurrencySymbol}
            />
          )
        }
        return (
          <View style={styles.gridRow}>
            {row.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                onPress={() => onItemPress(item)}
                numColumns={2}
                hideCurrencySymbol={hideCurrencySymbol}
              />
            ))}
            {row.length < 2 && <View style={styles.gridPlaceholder} />}
          </View>
        )
      },
      [numColumns, hideCurrencySymbol, onItemPress]
    )

    const totalItems = sections.reduce((sum, s) => {
      return sum + s.data.reduce((rowSum, row) => rowSum + row.length, 0)
    }, 0)

    if (totalItems === 0) {
      return (
        <View style={styles.empty}>
          {ListHeaderComponent}
          <Ionicons name="restaurant-outline" size={48} color={theme.textMuted} />
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>No items found</Text>
        </View>
      )
    }

    return (
      <SectionList<MenuItem[], MenuSection>
        ref={ref}
        sections={sections}
        keyExtractor={(row, index) => Array.isArray(row) ? row.map((i) => i.id).join('-') + index : String(index)}
        renderSectionHeader={renderSectionHeader}
        renderItem={renderRow}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={ListHeaderComponent}
        stickySectionHeadersEnabled={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />
    )
  }
)

/** Chunk a flat array of items into rows for grid layout */
export function chunkItems(items: MenuItem[], numColumns: number): MenuItem[][] {
  if (numColumns === 1) {
    return items.map((item) => [item])
  }
  const chunks: MenuItem[][] = []
  for (let i = 0; i < items.length; i += numColumns) {
    chunks.push(items.slice(i, i + numColumns))
  }
  return chunks
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: 100,
  },
  gridRow: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    gap: 10,
  },
  gridPlaceholder: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    paddingTop: 16,
    paddingBottom: 10,
  },
  sectionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionIconText: {
    fontSize: 22,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  sectionCount: {
    fontSize: 13,
    marginTop: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
  },
})
