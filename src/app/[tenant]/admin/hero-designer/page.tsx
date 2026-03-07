import { getCachedTenantBySlug } from '@/lib/cache'
import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { HeroDesign } from '@/types/hero-designer'

const HeroDesigner = dynamic(
  () =>
    import('@/components/admin/hero-designer/hero-designer').then(
      (m) => m.HeroDesigner,
    ),
  { ssr: false },
)

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
      <HeroDesigner
        tenantId={tenantData.id}
        tenantSlug={tenantSlug}
        initialDesign={
          (tenantData.hero_design as unknown as HeroDesign) ?? null
        }
      />
    </div>
  )
}
