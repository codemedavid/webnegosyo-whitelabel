'use client'

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
    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
      <button
        className={`flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all ${
          !activeCategory
            ? 'bg-orange-100 text-orange-700'
            : 'text-gray-600 hover:text-orange-600 hover:bg-orange-50'
        }`}
        onClick={() => onCategoryChange(null)}
      >
        All Items
      </button>
      {categories.map((category) => (
        <button
          key={category.id}
          className={`flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all ${
            activeCategory === category.id
              ? 'bg-orange-100 text-orange-700'
              : 'text-gray-600 hover:text-orange-600 hover:bg-orange-50'
          }`}
          onClick={() => onCategoryChange(category.id)}
        >
          <span className="text-lg">{category.icon || '🍽️'}</span>
          {category.name}
        </button>
      ))}
    </div>
  )
}

