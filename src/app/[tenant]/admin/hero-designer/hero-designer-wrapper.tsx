'use client'

import dynamic from 'next/dynamic'
import type { HeroBlockDesign } from '@/types/hero-block-designer'

const HeroBlockDesigner = dynamic(
  () => import('@/components/admin/hero-block-designer/hero-block-designer').then(m => m.HeroBlockDesigner),
  { ssr: false },
)

interface HeroDesignerWrapperProps {
  tenantId: string
  tenantSlug: string
  initialDesign: HeroBlockDesign | null
  initialHeroSectionEnabled: boolean
}

export default function HeroDesignerWrapper({
  tenantId,
  tenantSlug,
  initialDesign,
  initialHeroSectionEnabled,
}: HeroDesignerWrapperProps) {
  const blockDesign = initialDesign && typeof initialDesign === 'object' && 'version' in initialDesign && (initialDesign as { version: number }).version === 4
    ? initialDesign as HeroBlockDesign
    : null

  return (
    <HeroBlockDesigner
      tenantId={tenantId}
      tenantSlug={tenantSlug}
      initialDesign={blockDesign}
      initialHeroSectionEnabled={initialHeroSectionEnabled}
    />
  )
}
