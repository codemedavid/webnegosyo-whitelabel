'use client'

interface CategoryLite {
  id: string
  name: string
  icon?: string
}

interface CategoryTabsProps {
  categories: CategoryLite[]
  activeCategory: string | null
  onCategoryChange: (categoryId: string | null) => void
  branding?: {
    primary: string
    textSecondary: string
  }
}

export function CategoryTabs({
  categories,
  activeCategory,
  onCategoryChange,
  branding,
}: CategoryTabsProps) {
  const primaryColor = branding?.primary || '#ea580c' // orange-600
  const textSecondary = branding?.textSecondary || '#6b7280' // gray-500

  return (
    <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-1 px-1">
      <button
        className="flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-medium transition-all shrink-0"
        style={{
          backgroundColor: !activeCategory ? `${primaryColor}15` : 'transparent',
          color: !activeCategory ? primaryColor : textSecondary,
        }}
        onMouseEnter={(e) => {
          if (activeCategory) {
            e.currentTarget.style.color = primaryColor
            e.currentTarget.style.backgroundColor = `${primaryColor}15`
          }
        }}
        onMouseLeave={(e) => {
          if (activeCategory) {
            e.currentTarget.style.color = textSecondary
            e.currentTarget.style.backgroundColor = 'transparent'
          }
        }}
        onClick={() => onCategoryChange(null)}
      >
        All Items
      </button>
      {categories.map((category) => (
        <button
          key={category.id}
          className="flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-medium transition-all shrink-0"
          style={{
            backgroundColor:
              activeCategory === category.id ? `${primaryColor}15` : 'transparent',
            color: activeCategory === category.id ? primaryColor : textSecondary,
          }}
          onMouseEnter={(e) => {
            if (activeCategory !== category.id) {
              e.currentTarget.style.color = primaryColor
              e.currentTarget.style.backgroundColor = `${primaryColor}15`
            }
          }}
          onMouseLeave={(e) => {
            if (activeCategory !== category.id) {
              e.currentTarget.style.color = textSecondary
              e.currentTarget.style.backgroundColor = 'transparent'
            }
          }}
          onClick={() => onCategoryChange(category.id)}
        >
          {category.icon && <span className="text-base">{category.icon}</span>}
          <span>{category.name}</span>
        </button>
      ))}
    </div>
  )
}

