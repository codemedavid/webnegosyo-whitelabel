import { redirect } from 'next/navigation'

import { PAGE_META } from '@/lib/page-designer/pages'

/** The designer opens on the page customers spend the longest on. */
export default async function PageDesignerIndex({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  redirect(`/${tenant}/admin/page-designer/${PAGE_META.tracking.slug}`)
}
