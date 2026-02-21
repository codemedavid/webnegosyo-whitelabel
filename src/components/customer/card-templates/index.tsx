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
import { GlassCard } from './glass-card'
import { PolaroidCard } from './polaroid-card'
import { BrutalistCard } from './brutalist-card'
import { MagazineCard } from './magazine-card'
import { ZenCard } from './zen-card'
import { NeonCard } from './neon-card'

// Export all templates
export { ClassicCard } from './classic-card'
export { MinimalCard } from './minimal-card'
export { ModernCard } from './modern-card'
export { ElegantCard } from './elegant-card'
export { CompactCard } from './compact-card'
export { BoldCard } from './bold-card'
export { GlassCard } from './glass-card'
export { PolaroidCard } from './polaroid-card'
export { BrutalistCard } from './brutalist-card'
export { MagazineCard } from './magazine-card'
export { ZenCard } from './zen-card'
export { NeonCard } from './neon-card'

interface CardTemplateProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
  branding: BrandingColors
  menuEngineeringEnabled?: boolean
  hideCurrencySymbol?: boolean
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
    case 'glass':
      return GlassCard
    case 'polaroid':
      return PolaroidCard
    case 'brutalist':
      return BrutalistCard
    case 'magazine':
      return MagazineCard
    case 'zen':
      return ZenCard
    case 'neon':
      return NeonCard
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


