import { CustomDomainCard } from '@/components/admin/custom-domain/custom-domain-card'
import { SettingsSection } from '@/components/admin/settings/settings-section'
import { StoreProfileCard } from '@/components/admin/settings/store-profile-card'
import { readVercelDomainsConfig } from '@/lib/domains/vercel-domains'
import { requireSettingsSection } from '@/lib/settings/load-settings-context'
import { getRootDomain } from '@/lib/tenant-host'

export default async function StoreSettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params
  const { tenant, viewer } = await requireSettingsSection(tenantSlug, 'store')

  return (
    <SettingsSection tenantSlug={tenantSlug} section="store">
      <StoreProfileCard
        name={tenant.name}
        slug={tenant.slug}
        isActive={tenant.is_active}
        domain={tenant.domain ?? null}
        rootDomain={getRootDomain()}
      />

      {/* The owner (or a superadmin) connects their own web address */}
      {viewer.isOwner && (
        <CustomDomainCard
          tenantId={tenant.id}
          initialDomain={tenant.domain ?? null}
          isAvailable={readVercelDomainsConfig() !== null}
        />
      )}
    </SettingsSection>
  )
}
