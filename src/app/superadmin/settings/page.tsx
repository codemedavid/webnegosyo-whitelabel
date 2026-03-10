import { Suspense } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { ChangePasswordForm } from '@/components/superadmin/change-password-form'

interface EnvCheck {
  label: string
  envVar: string
  required: boolean
}

const envChecks: EnvCheck[] = [
  { label: 'Supabase URL', envVar: 'NEXT_PUBLIC_SUPABASE_URL', required: true },
  { label: 'Supabase Anon Key', envVar: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: true },
  { label: 'Supabase Service Role Key', envVar: 'SUPABASE_SERVICE_ROLE_KEY', required: true },
  { label: 'Platform Root Domain', envVar: 'PLATFORM_ROOT_DOMAIN', required: true },
  { label: 'Cloudinary Cloud Name', envVar: 'NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', required: false },
  { label: 'Cloudinary Upload Preset', envVar: 'NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET', required: false },
  { label: 'Mapbox Access Token', envVar: 'NEXT_PUBLIC_MAPBOX_TOKEN', required: false },
  { label: 'NVIDIA API Key (AI Menu)', envVar: 'NVIDIA_API_KEY', required: false },
  { label: 'Sentry DSN', envVar: 'NEXT_PUBLIC_SENTRY_DSN', required: false },
]

function SystemStatus() {
  const results = envChecks.map((check) => {
    const isSet = !!process.env[check.envVar]
    return { ...check, isSet }
  })

  const requiredMissing = results.filter((r) => r.required && !r.isSet).length
  const optionalMissing = results.filter((r) => !r.required && !r.isSet).length

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Environment Configuration</CardTitle>
          <CardDescription>
            Status of required and optional environment variables
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requiredMissing > 0 && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{requiredMissing} required variable{requiredMissing > 1 ? 's' : ''} missing</span>
            </div>
          )}
          <div className="space-y-2">
            {results.map((check) => (
              <div
                key={check.envVar}
                className="flex items-center justify-between rounded-lg border px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  {check.isSet ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : check.required ? (
                    <XCircle className="h-4 w-4 text-destructive" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                  <span className="text-sm">{check.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-muted-foreground">{check.envVar}</code>
                  <Badge
                    variant={check.isSet ? 'default' : check.required ? 'destructive' : 'secondary'}
                    className="text-xs"
                  >
                    {check.isSet ? 'Set' : 'Missing'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
          {optionalMissing > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {optionalMissing} optional variable{optionalMissing > 1 ? 's' : ''} not configured.
              Features depending on them will be unavailable.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>System Information</CardTitle>
          <CardDescription>Runtime environment details</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <span className="text-sm">Node.js Environment</span>
              <Badge variant="secondary">{process.env.NODE_ENV}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <span className="text-sm">Platform Domain</span>
              <code className="text-xs text-muted-foreground">
                {process.env.PLATFORM_ROOT_DOMAIN || 'Not set'}
              </code>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <span className="text-sm">Vercel Environment</span>
              <Badge variant="secondary">
                {process.env.VERCEL_ENV || 'local'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="h-6 w-48 animate-pulse rounded bg-muted" />
          <div className="h-4 w-64 animate-pulse rounded bg-muted" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 w-full animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function SuperAdminSettingsPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: '/superadmin' },
          { label: 'Settings' },
        ]}
      />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Platform configuration and system status</p>
      </div>

      <ChangePasswordForm />

      <Suspense fallback={<SettingsSkeleton />}>
        <SystemStatus />
      </Suspense>
    </div>
  )
}
