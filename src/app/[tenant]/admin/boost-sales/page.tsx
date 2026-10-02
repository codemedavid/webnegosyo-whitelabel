import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug } from '@/lib/cache'
import { getTenantBranding } from '@/lib/branding-utils'
import { getBoostWorkspace } from '@/lib/boost/workspace'
import { cartOfferThemeFromBranding, offerThemeFromBranding } from '@/components/customer/offers/offer-theme'
import { BoostHome } from '@/components/admin/boost/boost-home'
import type { EditorTarget } from '@/components/admin/boost/boost-model'
import { PickedTogetherSection, PickedTogetherSkeleton } from '@/components/admin/boost/picked-together-section'
import { listBoostAiLog, type BoostAiLog } from '@/lib/boost/ai/store'

// An AI generation runs inside this page's server action: room for the model call.
export const maxDuration = 60

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

/** The log is an add-on: if it cannot be read, the rest of Boost Sales still works. */
async function readAiLog(tenantId: string): Promise<BoostAiLog | null> {
  try {
    return await listBoostAiLog(tenantId)
  } catch (error) {
    console.error('[boost-ai] log read failed:', error)
    return null
  }
}

export default async function BoostSalesPage({ params, searchParams }: BoostSalesPageProps) {
  const [{ tenant: tenantSlug }, query] = await Promise.all([params, searchParams])
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) notFound()

  // Never a redirect: a store without Boost Sales gets the welcome screen,
  // with offers already drafted from its menu, and turns it on itself.
  const [workspace, aiLog] = await Promise.all([getBoostWorkspace(tenant), readAiLog(tenant.id)])
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
        aiLog={aiLog}
        insights={
          <Suspense fallback={<PickedTogetherSkeleton />}>
            <PickedTogetherSection tenant={tenant} />
          </Suspense>
        }
      />
    </div>
  )
}
