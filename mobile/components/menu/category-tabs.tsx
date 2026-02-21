import React, { useRef, useEffect } from 'react'
import {
  ScrollView,
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
} from 'react-native'
import { useTheme } from '@/theme/provider'
import { setAlpha } from '@/lib/branding-utils'
import type { Category } from '@/types/database'

interface CategorySidebarProps {
  categories: Category[]
  activeCategoryId: string | null
  onScrollToCategory: (sectionIndex: number) => void
}

const ESTIMATED_TAB_HEIGHT = 80

export function CategorySidebar({ categories, activeCategoryId, onScrollToCategory }: CategorySidebarProps) {
  const { theme } = useTheme()
  const scrollRef = useRef<ScrollView>(null)
  const activeColor = theme.menuCategoryActive || theme.buttonPrimary
  const inactiveColor = theme.menuCategoryInactive || theme.textSecondary

  // Auto-scroll the sidebar to keep the active tab visible
  useEffect(() => {
    if (!activeCategoryId) return
    const index = categories.findIndex(c => c.id === activeCategoryId)
    if (index >= 0) {
      scrollRef.current?.scrollTo({
        y: Math.max(0, index * ESTIMATED_TAB_HEIGHT - 40),
        animated: true,
      })
    }
  }, [activeCategoryId, categories])

  return (
    <View style={[styles.container, { backgroundColor: theme.cards, borderRightColor: theme.border }]}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {categories.map((category, index) => {
          const isActive = activeCategoryId === category.id
          return (
            <TouchableOpacity
              key={category.id}
              style={[
                styles.tab,
                isActive
                  ? {
                      backgroundColor: setAlpha(activeColor, 0.08),
                      borderLeftColor: activeColor,
                    }
                  : {
                      backgroundColor: 'transparent',
                      borderLeftColor: 'transparent',
                    },
              ]}
              onPress={() => onScrollToCategory(index)}
            >
              {category.icon ? (
                <Text style={styles.tabIcon}>{category.icon}</Text>
              ) : (
                <Text style={styles.tabIcon}>🍽️</Text>
              )}
              <Text
                style={[
                  styles.tabText,
                  {
                    color: isActive ? activeColor : inactiveColor,
                    fontWeight: isActive ? '700' : '500',
                  },
                ]}
                numberOfLines={2}
              >
                {category.name}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: 76,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  scrollContent: {
    paddingVertical: 8,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderLeftWidth: 3,
  },
  tabIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  tabText: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 14,
  },
})
