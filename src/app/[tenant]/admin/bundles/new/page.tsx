import { redirect } from 'next/navigation'

/** Combos are created in Boost Sales now; keep old links working. */
export default async function NewBundlePage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params
  redirect(`/${tenantSlug}/admin/boost-sales?new=combo`)
}
