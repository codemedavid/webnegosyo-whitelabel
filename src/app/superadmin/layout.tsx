'use client'

import { Sidebar, superAdminSidebarItems } from '@/components/shared/sidebar'

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <Sidebar
        items={superAdminSidebarItems}
        basePath="/superadmin"
        onLogout={() => {
          // TODO: Implement logout
          console.log('Logout')
        }}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto p-6">{children}</div>
      </main>
    </div>
  )
}

