import { redirect } from 'next/navigation'

/** Combos are edited in Boost Sales now; keep old links working. */
export default async function EditBundlePage({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant: tenantSlug, id } = await params
  redirect(`/${tenantSlug}/admin/boost-sales?edit=combo:${encodeURIComponent(id)}`)
}
