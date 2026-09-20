import { SuperAdminLayoutShell } from '@/components/superadmin/superadmin-layout-shell'

// Every superadmin page is authenticated and per-request. Pages that read
// through the service-role client touch no cookies and would otherwise be
// pre-rendered at build time — against the live database. That is how the
// 2026-09-21 production build failed. Pin the whole tree dynamic here.
export const dynamic = 'force-dynamic'

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return <SuperAdminLayoutShell>{children}</SuperAdminLayoutShell>
}
