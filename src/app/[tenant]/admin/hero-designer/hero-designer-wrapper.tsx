'use client'

import dynamic from 'next/dynamic'
import type { HeroDesign } from '@/types/hero-designer'

const HeroDesigner = dynamic(
  () =>
    import('@/components/admin/hero-designer/hero-designer').then(
      (m) => m.HeroDesigner,
    ),
  { ssr: false },
)

interface HeroDesignerWrapperProps {
  tenantId: string
  tenantSlug: string
  initialDesign: HeroDesign | null
  initialHeroSectionEnabled: boolean
}

export function HeroDesignerWrapper({
  tenantId,
  tenantSlug,
  initialDesign,
  initialHeroSectionEnabled,
}: HeroDesignerWrapperProps) {
  return (
    <HeroDesigner
      tenantId={tenantId}
      tenantSlug={tenantSlug}
      initialDesign={initialDesign}
      initialHeroSectionEnabled={initialHeroSectionEnabled}
    />
  )
}
