import { redirect } from 'next/navigation'

export default async function MenuEngineeringPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params
  redirect(`/${tenantSlug}/admin/boost-sales`)
}
