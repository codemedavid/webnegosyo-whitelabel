import { AdminPageSkeleton } from '@/components/admin/admin-page-skeleton'

/** Its own fallback, so opening an order type does not flash the list skeleton. */
export default function OrderTypeEditorLoading() {
  return <AdminPageSkeleton />
}
