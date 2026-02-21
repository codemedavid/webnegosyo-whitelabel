import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string }>
}): Promise<Metadata> {
  const { tenant: tenantSlug } = await params

  try {
    const supabase = await createClient()
    const { data: tenantData } = await supabase
      .from('tenants')
      .select('name')
      .eq('slug', tenantSlug)
      .maybeSingle()

    const tenant = tenantData as { name: string } | null
    const tenantName = tenant?.name || tenantSlug.replace(/-/g, ' ')

    return {
      title: `Menu | ${tenantName}`,
      description: `Browse the menu and order from ${tenantName}`,
    }
  } catch {
    return {
      title: 'Menu',
      description: 'Browse our menu and order your favorite dishes',
    }
  }
}

export default function MenuLayout({ children }: { children: React.ReactNode }) {
  return children
}
