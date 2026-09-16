import { redirect } from 'next/navigation'

/**
 * /superadmin/restaurants is what the sidebar label suggests the list is
 * called, but the list actually lives at /superadmin/tenants. Redirect so a
 * typed URL lands on the list instead of a 404, keeping a ?q= search intact.
 */
interface RestaurantsRedirectPageProps {
  searchParams: Promise<{ q?: string | string[] }>
}

export default async function RestaurantsRedirectPage({
  searchParams,
}: RestaurantsRedirectPageProps) {
  const { q } = await searchParams
  const query = Array.isArray(q) ? q[0] : q

  redirect(
    query ? `/superadmin/tenants?q=${encodeURIComponent(query)}` : '/superadmin/tenants',
  )
}
