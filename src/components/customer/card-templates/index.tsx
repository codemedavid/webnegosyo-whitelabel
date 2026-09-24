/**
 * Card Templates Index
 * Exports all card templates and provides a convenient selector.
 * Templates are lazy-loaded with next/dynamic since only one template
 * is active per tenant at a time.
 */

import dynamic from 'next/dynamic'
import { memo } from 'react'
import { CARD_TEMPLATE_IDS, DEFAULT_CARD_TEMPLATE, type CardTemplate } from '@/lib/card-templates'
import type { MenuItem } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'
import { isMenuItemOrderable } from '@/lib/menu-item-availability'
import { pickDesignId } from '@/lib/design-ids'

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

// Flexible templates (src/components/customer/card-templates/flex) — built on
// the shared card kit and driven by the merchant's Card style knobs.
const ShowcaseCard = dynamic(
  () => import('./flex/showcase-card').then((m) => ({ default: m.ShowcaseCard })),
  { loading: CardSkeleton }
)
const AtelierCard = dynamic(
  () => import('./flex/atelier-card').then((m) => ({ default: m.AtelierCard })),
  { loading: CardSkeleton }
)
const KioskCard = dynamic(
  () => import('./flex/kiosk-card').then((m) => ({ default: m.KioskCard })),
  { loading: CardSkeleton }
)
const StickerCard = dynamic(
  () => import('./flex/sticker-card').then((m) => ({ default: m.StickerCard })),
  { loading: CardSkeleton }
)
const MenuboardCard = dynamic(
  () => import('./flex/menuboard-card').then((m) => ({ default: m.MenuboardCard })),
  { loading: CardSkeleton }
)
const ArchCard = dynamic(
  () => import('./flex/arch-card').then((m) => ({ default: m.ArchCard })),
  { loading: CardSkeleton }
)

interface CardTemplateProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
  branding: BrandingColors
  menuEngineeringEnabled?: boolean
  hideCurrencySymbol?: boolean
  /** Above-the-fold card: image loads eagerly with high fetch priority. */
  priority?: boolean
}

// Typed against the registry's id union: registering a card without a
// component here is a compile error, not a silent fall back to Classic.
const CARD_COMPONENTS = {
  classic: ClassicCard,
  minimal: MinimalCard,
  modern: ModernCard,
  elegant: ElegantCard,
  compact: CompactCard,
  bold: BoldCard,
  glass: GlassCard,
  polaroid: PolaroidCard,
  brutalist: BrutalistCard,
  magazine: MagazineCard,
  zen: ZenCard,
  neon: NeonCard,
  storefront: StorefrontCard,
  showcase: ShowcaseCard,
  atelier: AtelierCard,
  kiosk: KioskCard,
  sticker: StickerCard,
  menuboard: MenuboardCard,
  arch: ArchCard,
} satisfies Record<CardTemplate, unknown>

/**
 * Get the card component for a template ID. Unknown ids fall back to Classic.
 */
export function getCardTemplateComponent(template: CardTemplate = DEFAULT_CARD_TEMPLATE) {
  return CARD_COMPONENTS[pickDesignId(template, CARD_TEMPLATE_IDS, DEFAULT_CARD_TEMPLATE)]
}

/**
 * Unified Card Template Renderer.
 * Automatically selects the correct template based on the template prop.
 * Only the selected template's JS chunk is downloaded.
 *
 * Orderability is resolved here, once, and handed to whichever design renders:
 * `isMenuItemOrderable` is the single home for that rule, and thirteen copies
 * of an `is_available` field read is exactly how a template drifts out of step
 * with it — reading an unset flag as out of stock, and missing every refusal
 * the helper makes for any other reason.
 */
export const CardTemplateRenderer = memo(function CardTemplateRenderer({
  template = 'classic',
  ...props
}: CardTemplateProps & { template?: CardTemplate }) {
  const CardComponent = getCardTemplateComponent(template)
  return <CardComponent {...props} isOrderable={isMenuItemOrderable(props.item)} />
})
