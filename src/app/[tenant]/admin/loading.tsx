import { AdminPageSkeleton } from '@/components/admin/admin-page-skeleton'

/**
 * Fallback for every admin section without its own skeleton. The dashboard
 * home streams its own analytics skeleton inside the page, so this stays
 * neutral rather than dashboard-shaped.
 */
export default function AdminLoading() {
  return <AdminPageSkeleton />
}
