/**
 * Card Templates Index
 * Exports all card templates and provides a convenient selector
 */

import type { CardTemplate } from '@/lib/card-templates'
import type { MenuItem } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'
import { ClassicCard } from './classic-card'
import { MinimalCard } from './minimal-card'
import { ModernCard } from './modern-card'
import { ElegantCard } from './elegant-card'
import { CompactCard } from './compact-card'
import { BoldCard } from './bold-card'

// Export all templates
export { ClassicCard } from './classic-card'
export { MinimalCard } from './minimal-card'
export { ModernCard } from './modern-card'
export { ElegantCard } from './elegant-card'
export { CompactCard } from './compact-card'
export { BoldCard } from './bold-card'

interface CardTemplateProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
  branding: BrandingColors
}

/**
 * Get the appropriate card component based on template ID
 */
export function getCardTemplateComponent(template: CardTemplate = 'classic') {
  switch (template) {
    case 'minimal':
      return MinimalCard
    case 'modern':
      return ModernCard
    case 'elegant':
      return ElegantCard
    case 'compact':
      return CompactCard
    case 'bold':
      return BoldCard
    case 'classic':
    default:
      return ClassicCard
  }
}

/**
 * Unified Card Template Renderer
 * Automatically selects the correct template based on the template prop
 */
export function CardTemplateRenderer({ 
  template = 'classic',
  ...props 
}: CardTemplateProps & { template?: CardTemplate }) {
  const CardComponent = getCardTemplateComponent(template)
  return <CardComponent {...props} />
}

