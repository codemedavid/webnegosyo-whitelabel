import type { ReactNode } from 'react'
import type { Category } from '@/types/database'

interface ResponsiveCategorySectionProps {
  displayLayout: Category['display_layout']
  horizontalContent: ReactNode
  gridContent: ReactNode
}

export function ResponsiveCategorySection({
  displayLayout,
  horizontalContent,
  gridContent,
}: ResponsiveCategorySectionProps) {
  switch (displayLayout) {
    case 'horizontal_scroll':
      return <>{horizontalContent}</>
    case 'horizontal_mobile_only':
      return (
        <>
          <div className="md:hidden">{horizontalContent}</div>
          <div className="hidden md:block">{gridContent}</div>
        </>
      )
    case 'horizontal_desktop_only':
      return (
        <>
          <div className="md:hidden">{gridContent}</div>
          <div className="hidden md:block">{horizontalContent}</div>
        </>
      )
    default:
      return <>{gridContent}</>
  }
}
