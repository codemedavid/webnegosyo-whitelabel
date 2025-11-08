import { MenuSkeleton } from '@/components/admin/menu-skeleton'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'

export default function MenuLoading() {
  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: '#' },
          { label: 'Menu Management' },
        ]}
      />
      <MenuSkeleton />
    </div>
  )
}


