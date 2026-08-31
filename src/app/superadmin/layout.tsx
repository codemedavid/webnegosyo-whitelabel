import { SuperAdminLayoutShell } from '@/components/superadmin/superadmin-layout-shell'

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return <SuperAdminLayoutShell>{children}</SuperAdminLayoutShell>
}
