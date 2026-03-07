/**
 * Card Templates Index
 * Exports all card templates and provides a convenient selector.
 * Templates are lazy-loaded with next/dynamic since only one template
 * is active per tenant at a time.
 */

import dynamic from 'next/dynamic'
import { memo } from 'react'
import type { CardTemplate } from '@/lib/card-templates'
import type { MenuItem } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'

// Minimal inline skeleton used as the loading fallback for all card templates.
// Keeps the grid stable while the correct template chunk loads.
function CardSkeleton() {
  return (
    <div className="rounded-xl bg-gray-100 animate-pulse" style={{ minHeight: 200 }} />
  )
}

// Lazily-loaded card templates — only the active template's chunk is fetched.
const ClassicCard = dynamic(
  () => import('./classic-card').then((m) => ({ default: m.ClassicCard })),
  { loading: CardSkeleton }
)
const MinimalCard = dynamic(
  () => import('./minimal-card').then((m) => ({ default: m.MinimalCard })),
  { loading: CardSkeleton }
)
const ModernCard = dynamic(
  () => import('./modern-card').then((m) => ({ default: m.ModernCard })),
  { loading: CardSkeleton }
)
const ElegantCard = dynamic(
  () => import('./elegant-card').then((m) => ({ default: m.ElegantCard })),
  { loading: CardSkeleton }
)
const CompactCard = dynamic(
  () => import('./compact-card').then((m) => ({ default: m.CompactCard })),
  { loading: CardSkeleton }
)
const BoldCard = dynamic(
  () => import('./bold-card').then((m) => ({ default: m.BoldCard })),
  { loading: CardSkeleton }
)
const GlassCard = dynamic(
  () => import('./glass-card').then((m) => ({ default: m.GlassCard })),
  { loading: CardSkeleton }
)
const PolaroidCard = dynamic(
  () => import('./polaroid-card').then((m) => ({ default: m.PolaroidCard })),
  { loading: CardSkeleton }
)
const BrutalistCard = dynamic(
  () => import('./brutalist-card').then((m) => ({ default: m.BrutalistCard })),
  { loading: CardSkeleton }
)
const MagazineCard = dynamic(
  () => import('./magazine-card').then((m) => ({ default: m.MagazineCard })),
  { loading: CardSkeleton }
)
const ZenCard = dynamic(
  () => import('./zen-card').then((m) => ({ default: m.ZenCard })),
  { loading: CardSkeleton }
)
const NeonCard = dynamic(
  () => import('./neon-card').then((m) => ({ default: m.NeonCard })),
  { loading: CardSkeleton }
)
const StorefrontCard = dynamic(
  () => import('./storefront-card').then((m) => ({ default: m.StorefrontCard })),
  { loading: CardSkeleton }
)

interface CardTemplateProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
  branding: BrandingColors
  menuEngineeringEnabled?: boolean
  hideCurrencySymbol?: boolean
}

/**
 * Get the appropriate card component based on template ID.
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
    case 'storefront':
      return StorefrontCard
    case 'classic':
    default:
      return ClassicCard
  }
}

/**
 * Unified Card Template Renderer.
 * Automatically selects the correct template based on the template prop.
 * Only the selected template's JS chunk is downloaded.
 */
export const CardTemplateRenderer = memo(function CardTemplateRenderer({
  template = 'classic',
  ...props
}: CardTemplateProps & { template?: CardTemplate }) {
  const CardComponent = getCardTemplateComponent(template)
  return <CardComponent {...props} />
})
