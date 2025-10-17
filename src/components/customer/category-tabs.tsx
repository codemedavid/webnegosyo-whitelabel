'use client'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface CategoryLite { id: string; name: string; icon?: string }

interface CategoryTabsProps {
  categories: CategoryLite[]
  activeCategory: string | null
  onCategoryChange: (categoryId: string | null) => void
}

export function CategoryTabs({
  categories,
  activeCategory,
  onCategoryChange,
}: CategoryTabsProps) {
  return (
    <Tabs
      value={activeCategory || 'all'}
      onValueChange={(value) => onCategoryChange(value === 'all' ? null : value)}
      className="w-full"
    >
      <TabsList className="grid w-full auto-cols-fr grid-flow-col overflow-x-auto">
        <TabsTrigger value="all" className="whitespace-nowrap">
          All Items
        </TabsTrigger>
        {categories.map((category) => (
          <TabsTrigger
            key={category.id}
            value={category.id}
            className="whitespace-nowrap"
          >
            <span className="mr-2">{category.icon}</span>
            {category.name}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

