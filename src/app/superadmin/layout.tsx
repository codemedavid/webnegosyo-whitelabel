import { Suspense } from 'react'
import { SuperAdminSidebar } from '@/components/superadmin/superadmin-sidebar'
import { NavigationProgress } from '@/components/shared/navigation-progress'

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-muted/30">
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <SuperAdminSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-6">{children}</div>
      </main>
    </div>
  )
}
