import { TenantLoginForm } from '@/components/auth/tenant-login-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function TenantLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>
  searchParams: Promise<{ redirect?: string; error?: string }>
}) {
  const { tenant: tenantSlug } = await params
  const search = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Admin Login</CardTitle>
          <CardDescription>
            Sign in to manage {tenantSlug.replace(/-/g, ' ')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TenantLoginForm 
            tenantSlug={tenantSlug}
            redirect={search.redirect || `/${tenantSlug}/admin`}
            unauthorized={search.error === 'unauthorized'}
          />
          
          <div className="mt-4 text-center text-sm text-muted-foreground">
            <p>Admin access only</p>
            <p className="mt-1">
              Contact the platform administrator for access.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

