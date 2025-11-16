'use client'

interface CategoryLite {
  id: string
  name: string
  icon?: string
}

interface CategorySubmenuProps {
  categories: CategoryLite[]
  activeCategory: string | null
  onCategoryChange: (categoryId: string | null) => void
  branding: {
    primary: string
    textSecondary: string
    header: string
    border: string
  }
}

export function CategorySubmenu({
  categories,
  activeCategory,
  onCategoryChange,
  branding,
}: CategorySubmenuProps) {
  return (
    <nav
      className="sticky top-20 z-40 hidden md:block border-b backdrop-blur-sm"
      style={{
        backgroundColor: branding.header,
        borderColor: branding.border,
      }}
    >
      <div className="container mx-auto px-4">
        <div className="flex gap-6 overflow-x-auto scrollbar-hide py-4">
          {/* All Items Button */}
          <button
            className="flex items-center gap-2 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors rounded-md shrink-0"
            style={{
              color: !activeCategory ? branding.primary : branding.textSecondary,
              backgroundColor: !activeCategory ? `${branding.primary}15` : 'transparent',
            }}
            onMouseEnter={(e) => {
              if (activeCategory) {
                e.currentTarget.style.color = branding.primary
                e.currentTarget.style.backgroundColor = `${branding.primary}15`
              }
            }}
            onMouseLeave={(e) => {
              if (activeCategory) {
                e.currentTarget.style.color = branding.textSecondary
                e.currentTarget.style.backgroundColor = 'transparent'
              }
            }}
            onClick={() => onCategoryChange(null)}
          >
            All
          </button>

          {/* Category Buttons */}
          {categories.map((category) => (
            <button
              key={category.id}
              className="flex items-center gap-2 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors rounded-md shrink-0"
              style={{
                color:
                  activeCategory === category.id ? branding.primary : branding.textSecondary,
                backgroundColor:
                  activeCategory === category.id ? `${branding.primary}15` : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (activeCategory !== category.id) {
                  e.currentTarget.style.color = branding.primary
                  e.currentTarget.style.backgroundColor = `${branding.primary}15`
                }
              }}
              onMouseLeave={(e) => {
                if (activeCategory !== category.id) {
                  e.currentTarget.style.color = branding.textSecondary
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
      </div>
    </nav>
  )
}

