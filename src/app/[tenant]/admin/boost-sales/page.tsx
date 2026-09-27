import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug } from '@/lib/cache'
import { getTenantBranding } from '@/lib/branding-utils'
import { getBoostWorkspace } from '@/lib/boost/workspace'
import { cartOfferThemeFromBranding, offerThemeFromBranding } from '@/components/customer/offers/offer-theme'
import { BoostHome } from '@/components/admin/boost/boost-home'
import type { EditorTarget } from '@/components/admin/boost/boost-model'

interface BoostSalesPageProps {
  params: Promise<{ tenant: string }>
  searchParams: Promise<{ new?: string; edit?: string }>
}

/**
 * Deep links from the old routes (/admin/bundles/new, /admin/bundles/[id])
 * and from anywhere else that wants to open an editor directly:
 * `?new=combo` or `?edit=combo:<id>`.
 */
function initialEditorFrom({ new: create, edit }: { new?: string; edit?: string }): EditorTarget | null {
  if (create === 'combo') return { kind: 'combo', comboId: null }
  if (create === 'upgrade') return { kind: 'upgrade', upgradeId: null }
  if (create === 'pairing') return { kind: 'pairing', groupKey: null }
  if (create === 'last_call') return { kind: 'last_call' }
  if (edit?.startsWith('combo:')) return { kind: 'combo', comboId: edit.slice('combo:'.length) }
  return null
}

export default async function BoostSalesPage({ params, searchParams }: BoostSalesPageProps) {
  const [{ tenant: tenantSlug }, query] = await Promise.all([params, searchParams])
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) notFound()

  // Never a redirect: a store without Boost Sales gets the welcome screen,
  // with offers already drafted from its menu, and turns it on itself.
  const workspace = await getBoostWorkspace(tenant)
  const branding = getTenantBranding(tenant)

  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/${tenantSlug}/admin` },
          { label: 'Boost Sales' },
        ]}
      />
      <BoostHome
        workspace={workspace}
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
        theme={offerThemeFromBranding(branding)}
        cartTheme={cartOfferThemeFromBranding(branding)}
        initialEditor={workspace.isEnabled ? initialEditorFrom(query) : null}
      />
    </div>
  )
}
