import { Suspense } from 'react'
import { SuperAdminSidebar } from '@/components/superadmin/superadmin-sidebar'
import { SuperAdminTopbar } from '@/components/superadmin/superadmin-topbar'
import { NavigationProgress } from '@/components/shared/navigation-progress'

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="superadmin-shell relative flex h-screen overflow-hidden bg-background text-foreground">
      {/* Decorative backdrop: glow + grid (matches /download) */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute left-1/2 top-0 h-[480px] w-[760px] -translate-x-1/2 rounded-full bg-white/[0.05] blur-[140px]" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />
      </div>

      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>

      <SuperAdminSidebar />

      <main className="relative z-10 flex-1 overflow-y-auto">
        {/* Sticky top bar self-gates on /superadmin/login (renders chrome-free). */}
        <SuperAdminTopbar />
        <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
      </main>
    </div>
  )
}
