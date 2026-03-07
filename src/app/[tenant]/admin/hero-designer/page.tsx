import { getCachedTenantBySlug } from '@/lib/cache'
import { redirect } from 'next/navigation'
import type { HeroDesign } from '@/types/hero-designer'
import { HeroDesignerWrapper } from './hero-designer-wrapper'

export default async function HeroDesignerPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params
  const tenantData = await getCachedTenantBySlug(tenantSlug)

  if (!tenantData) redirect('/')

  return (
    <div className="h-screen flex flex-col">
      <HeroDesignerWrapper
        tenantId={tenantData.id}
        tenantSlug={tenantSlug}
        initialDesign={
          (tenantData.hero_design as unknown as HeroDesign) ?? null
        }
      />
    </div>
  )
}
