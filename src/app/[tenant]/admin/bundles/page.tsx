import { redirect } from 'next/navigation'

export default async function BundlesPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params
  redirect(`/${tenantSlug}/admin/boost-sales`)
}
