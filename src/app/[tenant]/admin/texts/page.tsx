import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getCachedTenantBySlug } from '@/lib/cache'
import { resolvePlatformOrigin } from '@/lib/onboarding/first-week'
import { BRANCH_REFUSAL, requireTextsAccess } from '@/lib/texts/gate'
import { loadTextsPage } from '@/lib/texts/server/page-data'
import { TextsWorkspace } from '@/components/admin/texts/texts-workspace'
import { TextsNotAllowed } from '@/components/admin/texts/texts-not-allowed'
import { TextsSkeleton } from '@/components/admin/texts/texts-skeleton'

interface TextsPageProps {
  params: Promise<{ tenant: string }>
}

async function readAccess(tenantId: string) {
  try {
    return { ok: true as const, caller: await requireTextsAccess(tenantId, 'view') }
  } catch (error) {
    return { ok: false as const, isBranch: error instanceof Error && error.message === BRANCH_REFUSAL }
  }
}

/**
 * Texts: campaigns, automatic texts, what went out, and the store's texting
 * rules — with the sending phone's health above everything. The gate runs
 * here (store-wide, `customers`), the data in one server read; the sheets
 * and tabs live in the URL and are handled by the client workspace.
 */
export default async function TextsPage({ params }: TextsPageProps) {
  const { tenant: tenantSlug } = await params
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) notFound()

  const access = await readAccess(tenant.id)
  if (!access.ok) return <TextsNotAllowed isBranch={access.isBranch} />

  const data = await loadTextsPage({ id: tenant.id, slug: tenantSlug, name: tenant.name }, access.caller, new Date())
  return (
    <Suspense fallback={<TextsSkeleton />}>
      {/* The app is a sideloaded APK: install and update from the platform's /download page,
          absolute because a store's own domain rewrites /download to the store. */}
      <TextsWorkspace data={data} downloadUrl={`${resolvePlatformOrigin()}/download`} />
    </Suspense>
  )
}
