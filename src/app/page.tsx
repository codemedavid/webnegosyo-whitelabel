import { redirect } from 'next/navigation'
import { mockTenants } from '@/lib/mockData'

export default function HomePage() {
  // Redirect to the first tenant's menu
  const firstTenant = mockTenants[0]
  
  if (firstTenant) {
    redirect(`/${firstTenant.slug}/menu`)
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Welcome to Restaurant Menu System</h1>
        <p className="text-muted-foreground">No restaurants found</p>
      </div>
    </div>
  )
}
